using CK.Auth;
using CK.Cris;
using CK.TypeScript;

namespace CK.SessionChannel;

/// <summary>
/// Binds an anonymous WebSocket connection to the user that sends this command.
/// <para>
/// This is the whole authentication of the channel: the socket carries no credential, but this
/// command travels on the authenticated Cris endpoint (Bearer token), so its <c>ActorId</c> is
/// trustworthy. The client sends it as soon as it has received its connection identifier, and again
/// after every reconnection.
/// </para>
/// <para>
/// Being an <see cref="ICommandAuthNormal"/>, it goes through every command-handling validator. That
/// is not incidental: a validator that rejects a user (a banished one, typically) rejects this
/// command too, which is what turns a mere reconnection into a re-check of that user's standing.
/// </para>
/// </summary>
[TypeScriptType]
public interface IRegisterSessionCommand : ICommand, ICommandAuthNormal
{
    /// <summary>
    /// The connection identifier the server sent on connect.
    /// </summary>
    string ConnectionId { get; set; }
}
