# CK.AspNet.ActorChannel

Pushing to an actor - the authenticated user - rather than to a socket. The shared WebSocket channel
knows connections, a feature knows actors. This package is the index between the two, and it binds an
anonymous socket to an identity without ever putting a credential on the socket.

```csharp
public interface IActorChannelPush : ISingletonAutoService
{
    Task PushAsync( int userId, string type );
}
```

## Getting it into an application

There is no `AddActorChannel()`. The package declares no extension method at all, because there is
nothing for a host to call: [`ActorChannelRegistry`](ActorChannelRegistry.cs) is an `IRealObject`
whose dependency arrives through `StObjConstruct( WebSocketChannelManager )`, whose subscription
happens in `StObjInitialize`, and whose command handling is declared by `[CommandHandler]`. The engine
finds it over the bin path and builds it into the map. `IActorChannelPush` is an
`ISingletonAutoService` that resolves to that same object.

What the host must still do is not in this package, and takes two packages rather than one. Call
`AddWebSocketChannel()` on the builder and `UseWebSocketChannel()` on the application, once for the
whole application: that is `CK.AspNet.WebSocketChannel`, and it maps the socket endpoint. Then put the
Cris middleware in the pipeline with `UseCris()`, from `CK.Cris.AspNet`, which this package does not
reference: the registration command travels there, so without it nothing ever reaches the handler.
Miss either and nothing is indexed, so a `PushAsync` with a valid type returns without doing anything.

## The two halves of a feature

A feature lives on both sides of the socket, and the `type` string is the contract between them. It
is free-form - no registry of allowed values - and the two sides match it literally. Each side checks
it once: the push side throws on a null, empty or whitespace type before anything is sent, and the
client ignores any message whose `type` is not a string. A type nobody registered is dropped
silently.

Server side, inject `IActorChannelPush` and push. The feature knows the actor identifier and a
message type, and nothing about sockets:

```csharp
public class BanService
{
    readonly IActorChannelPush _push;
    public BanService( IActorChannelPush push ) => _push = push;

    public Task BanAsync( int userId ) => _push.PushAsync( userId, "banned" );
}
```

Client side, take the channel and register for the types you care about. `ActorChannel` ships in
[`Res/actor-channel.ts`](Res/actor-channel.ts):

```typescript
import { ActorChannel, CrisEndpoint, WSConnection } from '@local/ck-gen';

// Provided by your application's wiring.
declare const wsConnection: WSConnection;
declare const crisEndpoint: CrisEndpoint;

// Illustration, not code from this repository: one channel for the application, built once and
// shared. Two started instances would both claim the topic and the second would silence the first.
const channel = new ActorChannel( wsConnection, crisEndpoint );

class BanWatcher {
    constructor() {
        channel.start();   // idempotent - harmless if something already started it
        channel.onMessage( 'banned', () => this.doSomething() );
    }

    doSomething(): void {
        // Do Something
    }
}
```

`start()` is what claims the topic on the shared socket. Registering a handler without it leaves the
handler in a map nothing feeds. Order does not matter on an already-open connection: claiming a topic
fires the connection callback at once when an identifier is already known, so a channel started late
binds immediately instead of waiting for the next reconnection. `stopAsync()` releases the topic and
its connection callbacks, and deliberately leaves the socket open, since it belongs to the application
and the other features are using it. It does not forget your `onMessage` registrations: a restart
picks them up again.

A framework with a DI container normally provides that single instance, and starts the channel for
you as it follows the authentication. That is why the call above is idempotent rather than guarded.

Each type keeps its own handler list, so several features can watch different types on the one
channel, and one feature can watch several. `onRegisterError` completes the client's public surface,
beside `onMessage`, `start` and `stopAsync`. Its declaration calls a rejection the server's
way of saying this client is no longer welcome, but the code is wider: the whole send sits in one
`try`, so a transport failure, an HTTP error and a server refusal all arrive by the same path. The
handler signature is `( error: unknown ) => void`: what it receives is whatever the send threw, with
no shape guaranteed. A refusal can come from the authentication validation the command goes through,
or from the three `InvalidDataException` of this package's own handler.

The guard sits in the `catch`, so what it drops is a stale *failure* - one arriving after a stop, or
for a connection already replaced. A rejection that concerns a socket you no longer have is not
reported.

Every connection still open and bound to that actor receives the push - several tabs, several
devices. A socket that never got bound to that actor receives nothing: it was never indexed at all,
or it is indexed under someone else, or it is gone and the shared channel drops the send. One refused
because it was already bound to another user keeps that earlier binding, and that user's pushes with
it. An actor with no bound connection is not an error and not a queue: the call does nothing and the
signal is lost. Nothing replays it. What a reconnection restores is the binding, so the next push
gets through.

The sends are sequential and unguarded. A write that throws ends the loop, so the connections after
it in the iteration are not reached and the exception reaches your caller.

What crosses is only the type. The payload is `{"type":"<type>"}` and there is no payload parameter;
the shared channel wraps it in its own envelope, so the frame on the socket is
`{"topic":"CK.AspNet.ActorChannel","message":{"type":"<type>"}}`. This is a signal, not a data
channel: the handler learns that something happened and fetches what it needs through its usual
endpoint.

## Binding a connection to an actor

1. The client opens the anonymous socket and receives its connection identifier as the first frame.
2. It sends [`IRegisterActorChannelCommand`](IRegisterActorChannelCommand.cs), carrying that
   identifier, on the authenticated Cris endpoint.
3. The handler binds the connection to the command's `ActorId`, which is trustworthy because that
   endpoint authenticated it.

No token ever transits through a socket URL, where it would land in proxy logs and browser history.
The socket stays anonymous for its whole life. What is identified is an entry in an index.

The client re-sends the command after every reconnection. That does not by itself re-check a banished
user, although the declaration says it does. The re-check is whatever validator the application has
installed to refuse that user; this package declares none. Where there is one, a user banished while
connected keeps their current socket, but the binding dies with that socket - the closed event
unindexes it - and the next reconnection is refused, so it is never re-established. Nothing here
closes a socket.

## The registry

[`ActorChannelRegistry`](ActorChannelRegistry.cs) is an `IRealObject` holding two dictionaries:

- `_byActor`, user to set of connection identifiers, which is what `PushAsync` iterates.

- `_actorByConnection`, the reverse, so a closed connection is unindexed without having to ask anyone
  which user it was bound to, and without scanning. Nothing outside the registry can supply the user:
  the closed-connection event is `ConnectionClosedEvent( string ConnectionId, Exception? Exception )`,
  which names no user, and a live `WebSocketChannelConnection` would not have known either. `_byActor`
  alone would answer only by walking every user's set, so the binding is written down both ways.

It writes under one topic on the shared channel. Claiming a topic is a client-side notion, and nothing
here subscribes to incoming messages. The TypeScript side re-declares the same literal rather than
deriving it from anything, so the two are kept in sync by hand:

```csharp
public const string Topic = "CK.AspNet.ActorChannel";
```

`Unindex` removes the user entry once its last connection is gone. Otherwise the dictionary would keep
one empty set per user ever seen, for the lifetime of the process.

## The registration handler

`HandleRegisterActorChannel` is short. It guards three things.

**The connection may not exist.** `TryGetConnection` checks that first, and it is a plain dictionary
lookup. The auth validator has already established that the caller is authenticated and that the
`ActorId` on the command is their own, but it says nothing about the connection. So any authenticated
caller can claim an existing, not-yet-bound connection identifier: the handler compares nothing
between caller and connection, and a `WebSocketChannelConnection` carries no identity to compare. The
message it throws says *"does not exist, or is not identified as you"*; the second half is not a check
the method performs. Do not read it as a guarantee.

**The same connection may register twice.** `GetOrAdd` makes a repeat harmless. A reconnection cannot
cause one - it carries a brand new identifier on both sides - but a client that stops and restarts the
channel on a live socket re-sends the one it already has, and a retry must not create a second index
entry. Only a bind to a different user is refused.

**The connection may die mid-registration.** The check is repeated after the insertion, and on loss
the entry is removed. Not always successfully: if the closed event fired between the two insertions,
it already took the reverse entry, `Unindex` finds nothing to remove and returns, and the `_byActor`
entry inserted a line earlier stays for the lifetime of the process. The second check is there for
the other interleaving, where the closed event fired before anything was indexed.

Subscribing to the manager's closed-connection event happens in `StObjInitialize`, not on host start.
`StObjInitialize` runs once per StObjMap; a host start runs once per host, and several hosts can share
one map, so subscribing there would add a handler per start.

## Requirements

- `CK.AspNet.WebSocketChannel`, the shared channel this indexes. `WebSocketChannelManager` is taken in
  `StObjConstruct`.

- `CK.Cris.Auth`, for the validation that makes the binding trustworthy, and for `ICommandAuthNormal`
  which arrives through it.

- `CK.Cris.TypeScript`, spelled `CK.Cris.Typescript` in the csproj, and `CK.TS.AspNet.WebSocketChannel`,
  for the `WebSocketChannelPackage` this one requires and the TypeScript toolchain.
  [`Res/actor-channel.ts`](Res/actor-channel.ts) is hand-written, embedded by the `Res/` convention of
  the CK resource targets, and declared to the TypeScript engine by `[TypeScriptFile]`. What is
  generated from C# is the `RegisterActorChannelCommand` class, from `[TypeScriptType]` on the command.
