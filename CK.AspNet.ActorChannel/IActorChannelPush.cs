using CK.Core;
using System.Threading.Tasks;

namespace CK.AspNet.ActorChannel;

/// <summary>
/// Pushes a typed message to every open connection of one user.
/// <para>
/// This is the whole public surface of the channel for a feature that wants to notify a user: the
/// feature knows the user identifier and a message type, and nothing about sockets.
/// </para>
/// </summary>
public interface IActorChannelPush : ISingletonAutoService
{
    /// <summary>
    /// Pushes <c>{"type":"&lt;type&gt;"}</c> to every connection currently bound to <paramref name="userId"/>,
    /// under this feature's topic on the application-wide channel.
    /// Does nothing when the user has no open connection: an offline client is caught later, when it
    /// reconnects and re-sends its <see cref="IRegisterActorChannelCommand"/>.
    /// </summary>
    /// <param name="userId">The user to notify.</param>
    /// <param name="type">The message type, as seen by the client.</param>
    Task PushAsync( int userId, string type );
}
