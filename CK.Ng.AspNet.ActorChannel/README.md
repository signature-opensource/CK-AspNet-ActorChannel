# CK.Ng.AspNet.ActorChannel

The Angular side of the actor channel. It provides the one `ActorChannel` of the application as an
injectable and starts it while someone is authenticated. A feature injects it and registers the
message types it cares about.

> ℹ️ Read [CK.AspNet.ActorChannel](../CK.AspNet.ActorChannel/README.md) first. The topic, the
> registration command and the `{"type":"..."}` signal are defined there. This package wires the
> client half.

## The package declaration

```csharp
[TypeScriptPackage]
[Requires<ActorChannelPackage, NgWebSocketChannelPackage, CrisAspNetPackage, CK.Ng.AspNet.Auth.AspNetAuthPackage>]
[NgProviderImport( "inject", From = "@angular/core" )]
[NgProviderImport( "ActorChannel, WSConnection, HttpCrisEndpoint" )]
[NgProviderImport( "provideActorChannelSupport", From = "@local/ck-gen/CK/Ng/AspNet/ActorChannel/actor-channel-support" )]
[NgProvider( "{ provide: ActorChannel, useFactory: () => new ActorChannel( inject( WSConnection ), inject( HttpCrisEndpoint ) ) }" )]
[NgProvider( "provideActorChannelSupport()", "#Support" )]
public class NgActorChannelPackage : TypeScriptPackage { }
```

There is no TypeScript module to import and no provider array to edit. Referencing the package
contributes these providers to the generated Angular application, and `ActorChannel` becomes
injectable everywhere.

That provider is what the package is for. Inject `ActorChannel`, never construct one: two started
instances would both claim the channel topic on the shared `WSConnection`, the second
registration silently replaces the first, and the feature that registered first stops receiving
with nothing logged. The constructor is public, so nothing prevents it - declaring the channel once in
the DI container is what removes the reason to.

```typescript
import { inject, Injectable } from '@angular/core';
import { ActorChannel } from '@local/ck-gen';

@Injectable( { providedIn: 'root' } )
class BanWatcher {
    readonly channel = inject( ActorChannel );

    constructor() {
        this.channel.onMessage( 'banned', () => this.doSomething() );
    }

    doSomething(): void {
        // Do Something
    }
}
```

No construction, and no `start()` either: the support provider does that, which the next section
covers.

Each `NgProviderImport` exists for a symbol used in an `NgProvider` expression. The generator copies
that expression verbatim and resolves no import on its own, so every identifier in it needs a matching
import.

The factory shows the two dependencies of the client. `WSConnection` is the shared socket, provided by
`CK.Ng.AspNet.WebSocketChannel`, and is where messages arrive. `HttpCrisEndpoint` is the authenticated
command channel, from `CK.Ng.Cris.AspNet`, and is how the registration is sent. The
`AspNetAuthPackage` requirement is the third leg, and the csproj comment says why: *"NgAuthService:
the channel binds an actor, so it has to know who is authenticated."*

## Binding and authentication

You do not have to call `start()` yourself. `provideActorChannelSupport()` does it, in an effect on
the authentication level: `start()` as soon as the level is `Normal` or above, `stopAsync()` whenever
it is below. That is why the channel is not connected at startup and forgotten. It starts when
someone authenticates, rebinds after a reconnection, and has nothing to bind while nobody is logged
in. That matches the server, where the registration command requires a normal authentication level.

The effect watches the level, not the actor. A change of user that never drops below `Normal` - an
impersonation, or a login while already logged in - re-runs it and `start()` returns at once, so the
connection stays bound to the previous actor server-side. Do not rely on a mid-session identity
change reaching this channel.

[`Res/actor-channel-support.ts`](Res/actor-channel-support.ts) is the provider factory behind
`provideActorChannelSupport()`. The `"#Support"` beside it is a source-name suffix: it is appended to
the C# type name to give this second provider its own identifier,
`CK.Ng.AspNet.ActorChannel.NgActorChannelPackage#Support`. Nothing requires it to be unique - the
engine appends each provider line without checking - and `CK.Ng.Cris.AspNet.Auth` passes `"#Support"`
while declaring a single `NgProvider`. Its consumer is the generated `exclude( sourceName )`, which
removes every provider carrying that source.

## Requirements

- `CK.AspNet.ActorChannel`, for `ActorChannelPackage` and the contract it generates.

- `CK.TS.Angular`, for `[NgProvider]` and `[NgProviderImport]`. `[TypeScriptPackage]` is declared
  further upstream, in `CK.TypeScript`, and arrives through it.

- `CK.Ng.AspNet.WebSocketChannel`, for `NgWebSocketChannelPackage` and the Angular provider of the
  socket. `WSConnection` itself is declared one layer down, in `CK.TS.AspNet.WebSocketChannel`.

- `CK.Ng.AspNet.Auth`, for the authentication the binding follows.

- `CK.Ng.Cris.AspNet`, for `CrisAspNetPackage` and its provider. `HttpCrisEndpoint` is emitted by the
  Cris TypeScript engine rather than shipped as a file.
