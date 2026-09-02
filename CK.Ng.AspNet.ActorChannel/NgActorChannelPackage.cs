using CK.AspNet.ActorChannel;
using CK.Core;
using CK.Ng.AspNet.WebSocketChannel;
using CK.Ng.Cris.AspNet;
using CK.TS.Angular;
using CK.TypeScript;

namespace CK.Ng.AspNet.ActorChannel;

/// <summary>
/// Provides the one <c>ActorChannel</c> of the application and binds it to the authenticated actor.
/// <para>
/// A feature injects it and registers the message types it cares about. It must not construct one:
/// two instances would both claim the channel topic on the shared <c>WSConnection</c>, and the second
/// registration silently replaces the first - so the feature that registered first would simply stop
/// receiving, with nothing to show why.
/// </para>
/// <para>
/// Binding follows the authentication level rather than the application lifetime: an anonymous
/// visitor has no actor to bind, and the server would refuse the registration of one anyway.
/// </para>
/// </summary>
[TypeScriptPackage]
[Requires<ActorChannelPackage, NgWebSocketChannelPackage, CrisAspNetPackage, CK.Ng.AspNet.Auth.AspNetAuthPackage>]
[NgProviderImport( "inject", From = "@angular/core" )]
[NgProviderImport( "ActorChannel, WSConnection, HttpCrisEndpoint" )]
[NgProviderImport( "provideActorChannelSupport", From = "@local/ck-gen/CK/Ng/AspNet/ActorChannel/actor-channel-support" )]
[NgProvider( "{ provide: ActorChannel, useFactory: () => new ActorChannel( inject( WSConnection ), inject( HttpCrisEndpoint ) ) }" )]
[NgProvider( "provideActorChannelSupport()", "#Support" )]
public class NgActorChannelPackage : TypeScriptPackage
{
}
