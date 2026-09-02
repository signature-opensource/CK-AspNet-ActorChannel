import { inject, Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActorChannel, HttpCrisEndpoint, WSConnection } from '@local/ck-gen';
import { appConfig } from './app.config';

// Trick from https://stackoverflow.com/a/77047461/190380
// When debugging ("Debug Test at Cursor" in menu), this cancels jest timeout.
if ( process.env["VSCODE_INSPECTOR_OPTIONS"] ) jest.setTimeout( 30 * 60 * 1000 );

/** Must stay in sync with ActorChannelRegistry.Topic. */
const ACTOR_CHANNEL_TOPIC = 'CK.AspNet.ActorChannel';

// Expected noise: appConfig brings the whole generated graph, so the app initializer of
// CK.Ng.AspNet.Auth runs too and refreshes the authentication over HTTP. In jsdom that times out and
// logs after the suite has finished ("Cannot log after tests are done", HTTP.Status.408). It belongs
// to that package, not to these tests, and silencing it from here would mean stubbing AXIOS for
// everyone - more fragile than the noise it removes.

/**
 * A WebSocket we drive by hand: WSConnection reads the constructor from the global, so replacing it is
 * all it takes to deliver frames without a server.
 */
class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    static get last(): FakeWebSocket {
        const last = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
        if ( !last ) throw new Error( 'No socket has been created.' );
        return last;
    }

    onmessage: ( ( e: unknown ) => void ) | null = null;
    onerror: ( () => void ) | null = null;
    onclose: ( ( e: unknown ) => void ) | null = null;

    readonly #closeListeners: Array<() => void> = [];

    constructor( readonly url: string ) {
        FakeWebSocket.instances.push( this );
    }

    // Both are load-bearing: WSConnection.stopAsync waits on the 'close' listener it registers here
    // before resolving. A no-op close leaves it pending, which surfaces as a timed-out afterEach -
    // nothing resembling its cause.
    addEventListener( type: string, handler: () => void ): void {
        if ( type === 'close' ) this.#closeListeners.push( handler );
    }

    close(): void {
        this.onclose?.( { wasClean: true, reason: '' } );
        for ( const l of this.#closeListeners ) l();
    }

    emitFrame( frame: unknown ): void {
        this.onmessage?.( { data: JSON.stringify( frame ) } );
    }
}

/**
 * Stands in for HttpCrisEndpoint. Without it the registration would issue a real XHR that jsdom fails
 * loudly and that leaves the jest worker with a pending request. Recording the commands also lets us
 * check what the channel actually binds.
 */
class CrisEndpointStub {
    readonly sent: Array<{ connectionId?: string }> = [];

    sendOrThrowAsync( command: { connectionId?: string } ): Promise<unknown> {
        this.sent.push( command );
        return Promise.resolve( undefined );
    }
}

// Two independent features, each caring about its own message type. This is the shape the shared
// channel exists for, and what a hand-constructed channel per feature would break.
@Injectable()
class BanWatcher {
    readonly seen: Array<unknown> = [];
    readonly channel = inject( ActorChannel );

    constructor() {
        this.channel.onMessage( 'banned', m => this.seen.push( m ) );
    }
}

@Injectable()
class QuotaWatcher {
    readonly seen: Array<unknown> = [];
    readonly channel = inject( ActorChannel );

    constructor() {
        this.channel.onMessage( 'quota', m => this.seen.push( m ) );
    }
}

// One feature interested in more than one thing: the common case as soon as a feature grows, and the
// reason each type keeps its own handler list rather than the channel having a single sink.
@Injectable()
class TwoTypesWatcher {
    readonly banned: Array<unknown> = [];
    readonly quota: Array<unknown> = [];
    readonly channel = inject( ActorChannel );

    constructor() {
        this.channel.onMessage( 'banned', m => this.banned.push( m ) );
        this.channel.onMessage( 'quota', m => this.quota.push( m ) );
    }
}

describe( 'ActorChannel provider', () => {

    const globals = globalThis as unknown as Record<string, unknown>;
    const realWebSocket = globals['WebSocket'];
    let cris: CrisEndpointStub;

    beforeEach( () => {
        FakeWebSocket.instances = [];
        // Installed before anything injects WSConnection, which builds its socket from this global.
        globals['WebSocket'] = FakeWebSocket;
        jest.spyOn( console, 'warn' ).mockImplementation( () => { } );
        jest.spyOn( console, 'error' ).mockImplementation( () => { } );
        cris = new CrisEndpointStub();
        TestBed.configureTestingModule( {
            // appConfig carries the whole generated DI graph, provideZonelessChangeDetection included.
            // The overrides come after it, so they win.
            providers: [
                ...appConfig.providers,
                { provide: HttpCrisEndpoint, useValue: cris },
                BanWatcher,
                QuotaWatcher,
                TwoTypesWatcher
            ]
        } );
    } );

    afterEach( async () => {
        // Releases the socket and any pending reconnection, so nothing outlives the test.
        await TestBed.inject( WSConnection ).stopAsync();
        globals['WebSocket'] = realWebSocket;
        jest.restoreAllMocks();
    } );

    it( 'is injectable', () => {
        expect( TestBed.inject( ActorChannel ) ).toBeTruthy();
    } );

    it( 'is one single instance for the whole application', () => {
        // What replaces the `new ActorChannel( … )` each feature used to do: everyone gets the same one.
        const first = TestBed.inject( ActorChannel );
        const second = TestBed.inject( ActorChannel );
        expect( second ).toBe( first );

        // And the services that inject it get that very instance, not one of their own.
        expect( TestBed.inject( BanWatcher ).channel ).toBe( first );
        expect( TestBed.inject( QuotaWatcher ).channel ).toBe( first );
    } );

    it( 'serves several services at once, each its own message type', () => {
        const wsConnection = TestBed.inject( WSConnection );
        const channel = TestBed.inject( ActorChannel );
        const ban = TestBed.inject( BanWatcher );
        const quota = TestBed.inject( QuotaWatcher );

        // Started by hand: the authentication effect of provideActorChannelSupport would find an
        // anonymous NgAuthService here and release the topic. start() is public and idempotent.
        wsConnection.start();
        channel.start();

        FakeWebSocket.last.emitFrame( { connectionId: 'C1' } );
        FakeWebSocket.last.emitFrame( { topic: ACTOR_CHANNEL_TOPIC, message: { type: 'banned' } } );
        FakeWebSocket.last.emitFrame( { topic: ACTOR_CHANNEL_TOPIC, message: { type: 'quota', left: 3 } } );

        // The whole point: neither registration silenced the other.
        expect( ban.seen ).toEqual( [{ type: 'banned' }] );
        expect( quota.seen ).toEqual( [{ type: 'quota', left: 3 }] );
    } );

    it( 'serves one service registered on several types, each in its own place', () => {
        const wsConnection = TestBed.inject( WSConnection );
        const channel = TestBed.inject( ActorChannel );
        const watcher = TestBed.inject( TwoTypesWatcher );

        wsConnection.start();
        channel.start();
        FakeWebSocket.last.emitFrame( { connectionId: 'C1' } );
        FakeWebSocket.last.emitFrame( { topic: ACTOR_CHANNEL_TOPIC, message: { type: 'banned' } } );
        FakeWebSocket.last.emitFrame( { topic: ACTOR_CHANNEL_TOPIC, message: { type: 'quota', left: 3 } } );

        // Both arrived, and - the discriminating half - neither landed in the other's handler: the
        // channel routes by type, it does not broadcast.
        expect( watcher.banned ).toEqual( [{ type: 'banned' }] );
        expect( watcher.quota ).toEqual( [{ type: 'quota', left: 3 }] );
    } );

    it( 'serves several services registered on the very same type', () => {
        // The other side of sharing: two features can care about one message type, and ActorChannel
        // documents several handlers per type. Without this, only the last one registered would hear.
        const wsConnection = TestBed.inject( WSConnection );
        const channel = TestBed.inject( ActorChannel );
        const first: Array<unknown> = [];
        const second: Array<unknown> = [];
        channel.onMessage( 'banned', m => first.push( m ) );
        channel.onMessage( 'banned', m => second.push( m ) );

        wsConnection.start();
        channel.start();
        FakeWebSocket.last.emitFrame( { connectionId: 'C1' } );
        FakeWebSocket.last.emitFrame( { topic: ACTOR_CHANNEL_TOPIC, message: { type: 'banned' } } );

        expect( first ).toEqual( [{ type: 'banned' }] );
        expect( second ).toEqual( [{ type: 'banned' }] );
    } );

    it( 'binds the negotiated connection once, whatever the number of services', () => {
        const wsConnection = TestBed.inject( WSConnection );
        const channel = TestBed.inject( ActorChannel );
        TestBed.inject( BanWatcher );
        TestBed.inject( QuotaWatcher );

        wsConnection.start();
        channel.start();
        FakeWebSocket.last.emitFrame( { connectionId: 'C1' } );

        // One channel means one registration - two hand-built ones would have sent two.
        expect( cris.sent.length ).toBe( 1 );
        expect( cris.sent[0]?.connectionId ).toBe( 'C1' );
    } );

    it( 'ignores a type nobody registered, and keeps serving the others', () => {
        const wsConnection = TestBed.inject( WSConnection );
        const channel = TestBed.inject( ActorChannel );
        const ban = TestBed.inject( BanWatcher );

        wsConnection.start();
        channel.start();
        FakeWebSocket.last.emitFrame( { connectionId: 'C1' } );

        expect( () => FakeWebSocket.last.emitFrame( { topic: ACTOR_CHANNEL_TOPIC, message: { type: 'nobody' } } ) )
            .not.toThrow();
        FakeWebSocket.last.emitFrame( { topic: ACTOR_CHANNEL_TOPIC, message: { type: 'banned' } } );

        expect( ban.seen ).toEqual( [{ type: 'banned' }] );
    } );
} );
