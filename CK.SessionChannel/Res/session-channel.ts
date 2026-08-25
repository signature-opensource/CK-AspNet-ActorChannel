import { CrisEndpoint, RegisterSessionCommand, WSConnection } from '@local/ck-gen';

/**
 * A message pushed by the server. Only `type` is guaranteed: senders are free to add their own
 * fields, which is why the index signature is kept open.
 */
export interface SessionChannelMessage {
  readonly type: string;
  readonly [key: string]: unknown;
}

export type SessionMessageHandler = ( message: SessionChannelMessage ) => void;
export type SessionErrorHandler = ( error: unknown ) => void;

/**
 * Channel topic of the session messages. Must stay in sync with `SessionChannelRegistry.Topic`.
 */
const SESSION_TOPIC = 'CK.SessionChannel';

/**
 * Session side of the application-wide WebSocket channel.
 *
 * The socket carries no credential: it is opened anonymously by WSConnection, the server answers with
 * a connection identifier, and this class binds the identity afterwards by sending that identifier
 * through the authenticated Cris endpoint. No token ever transits in the socket URL.
 *
 * That binding is replayed on every reconnection, which is what makes the session self-healing:
 * whatever the server refuses at registration time (a banished user, typically) is refused again the
 * moment the client comes back, without any polling in between.
 *
 * It owns no socket. Starting and stopping this channel claims and releases the `SC` topic; the
 * connection stays up for the other features either way.
 */
export class SessionChannel {
  readonly #handlers = new Map<string, Array<SessionMessageHandler>>();
  readonly #registerErrorHandlers: Array<SessionErrorHandler> = [];
  // Whether the caller asked for a session. Only used to keep start()/stopAsync() idempotent and to
  // drop the answer of a registration that was in flight when the session was stopped.
  #started = false;

  constructor(
    private readonly wsConnection: WSConnection,
    private readonly crisEndpoint: CrisEndpoint
  ) { }

  /** Registers a handler for one message type. Several handlers per type are allowed. */
  onMessage( type: string, handler: SessionMessageHandler ): void {
    const existing = this.#handlers.get( type );
    if ( existing ) existing.push( handler );
    else this.#handlers.set( type, [handler] );
  }

  /**
   * Registers a handler called when the registration command is rejected. This is not merely an
   * error path: a rejection is how the server tells this client that it is no longer welcome.
   */
  onRegisterError( handler: SessionErrorHandler ): void {
    this.#registerErrorHandlers.push( handler );
  }

  /** Starts the session: claims the topic and binds the current connection. Idempotent. */
  start(): void {
    if ( this.#started ) return;
    this.#started = true;
    this.wsConnection.addHandler( SESSION_TOPIC, {
      onMessage: message => this.#dispatch( message ),
      // Every reconnection needs the identity bound again: the identifier of the previous socket is
      // gone with it. This is the whole reason the ban of an unreachable user lands as soon as it
      // comes back, with no polling in between.
      onConnected: connectionId => void this.#registerAsync( connectionId )
    } );
    // No catch-up needed for a connection that is already established: addHandler calls onConnected
    // right away in that case.
  }

  /**
   * Stops the session: releases the topic, callbacks included. The socket belongs to the application
   * and is shared with the other features, so it is deliberately left open.
   */
  stopAsync(): Promise<void> {
    if ( this.#started ) {
      this.#started = false;
      this.wsConnection.removeHandler( SESSION_TOPIC );
    }
    return Promise.resolve();
  }

  #dispatch( message: unknown ): void {
    const m = message as Partial<SessionChannelMessage>;
    if ( typeof m?.type !== 'string' ) {
      console.warn( 'Session channel: message without a type, ignored.' );
      return;
    }
    const handlers = this.#handlers.get( m.type );
    if ( !handlers ) return;
    for ( const handler of handlers ) {
      try {
        handler( m as SessionChannelMessage );
      } catch ( e ) {
        // One faulty handler must not prevent the others from seeing the message.
        console.error( e );
      }
    }
  }

  async #registerAsync( connectionId: string ): Promise<void> {
    const command = new RegisterSessionCommand();
    command.connectionId = connectionId;
    try {
      await this.crisEndpoint.sendOrThrowAsync( command );
    } catch ( e ) {
      // A reconnection or a stop while the command was in flight: the answer no longer concerns us.
      if ( !this.#started || connectionId !== this.wsConnection.connectionId ) return;
      for ( const handler of this.#registerErrorHandlers ) {
        try {
          handler( e );
        } catch ( inner ) {
          console.error( inner );
        }
      }
    }
  }
}
