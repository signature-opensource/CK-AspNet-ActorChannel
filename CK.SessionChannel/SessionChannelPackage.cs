using CK.AspNet.WebSocketChannel;
using CK.Core;
using CK.TypeScript;

namespace CK.SessionChannel;

/// <summary>
/// TypeScript package that exposes the <c>SessionChannel</c> client to generated TypeScript clients.
/// <para>
/// The client is deliberately feature agnostic: it claims the session topic on the application-wide
/// <c>WSConnection</c>, negotiates its identity through the <see cref="IRegisterSessionCommand"/> and
/// dispatches the messages it receives by their <c>type</c>. What a given type means is the business
/// of whoever registers a handler.
/// </para>
/// </summary>
[TypeScriptPackage]
[Requires<WebSocketChannelPackage>]
[TypeScriptFile( "session-channel.ts", "SessionChannel" )]
public class SessionChannelPackage : TypeScriptPackage
{
}
