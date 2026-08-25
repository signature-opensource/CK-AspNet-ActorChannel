using CK.AspNet.WebSocketChannel;
using CK.Core;
using CK.TypeScript;

namespace CK.AspNet.ActorChannel;

/// <summary>
/// TypeScript package that exposes the <c>ActorChannel</c> client to generated TypeScript clients.
/// <para>
/// The client is deliberately feature agnostic: it claims its own topic on the application-wide
/// <c>WSConnection</c>, negotiates its identity through the <see cref="IRegisterActorChannelCommand"/> and
/// dispatches the messages it receives by their <c>type</c>. What a given type means is the business
/// of whoever registers a handler.
/// </para>
/// </summary>
[TypeScriptPackage]
[Requires<WebSocketChannelPackage>]
[TypeScriptFile( "actor-channel.ts", "ActorChannel" )]
public class ActorChannelPackage : TypeScriptPackage
{
}
