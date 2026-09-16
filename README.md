# CK-AspNet-ActorChannel

[![Licence](https://img.shields.io/github/license/signature-opensource/CK-AspNet-ActorChannel.svg)](LICENSE)

Push a signal to an actor - the authenticated user - over the application's shared WebSocket,
without ever putting a credential on the socket.

The socket stays anonymous: it hands back a connection identifier and carries no credential. An
authenticated command binds that identifier to an actor. This repository is the index in between.

| Package | Description | Latest stable |
|---------|-------------|---------------|
| [CK.AspNet.ActorChannel](CK.AspNet.ActorChannel/README.md) | The channel itself: the registration command, the per-actor index, the one push method a feature calls, and the TypeScript client shipped as a resource. | [![nuget](https://img.shields.io/nuget/v/CK.AspNet.ActorChannel.svg?label=CK.AspNet.ActorChannel)](https://www.nuget.org/packages/CK.AspNet.ActorChannel/) |
| [CK.Ng.AspNet.ActorChannel](CK.Ng.AspNet.ActorChannel/README.md) | The Angular wiring: providers that expose that TypeScript client as an injectable and keep it bound to the authenticated actor. | [![nuget](https://img.shields.io/nuget/v/CK.Ng.AspNet.ActorChannel.svg?label=CK.Ng.AspNet.ActorChannel)](https://www.nuget.org/packages/CK.Ng.AspNet.ActorChannel/) |

Read the first one first. The topic, the registration command and the shape of what is pushed are
defined there, and so is the client that consumes them. The second package only makes that client
injectable and drives its lifetime.

The socket belongs to `CK.AspNet.WebSocketChannel` and the authenticated command channel to the Cris
packages. What is added here is the identity index and the discipline around it.
