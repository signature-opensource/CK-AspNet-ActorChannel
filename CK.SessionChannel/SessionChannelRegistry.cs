using CK.AspNet.WebSocketChannel;
using CK.Core;
using CK.Cris;
using System;
using System.Buffers;
using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Tasks;

namespace CK.SessionChannel;

/// <summary>
/// Indexes the connections of the channel by the user they have been bound to, so that a message can
/// reach all the connections of one user at once (several tabs, several devices).
/// <para>
/// Handles <see cref="IRegisterSessionCommand"/>: this is where an anonymous socket becomes the socket
/// of an identified user. The socket itself belongs to <see cref="WebSocketChannelManager"/>; what
/// lives here is only the identity index, and this feature claims the <see cref="Topic"/> topic on it.
/// </para>
/// </summary>
public sealed class SessionChannelRegistry : IRealObject, ISessionChannelPush
{
    /// <summary>
    /// The channel topic of the session messages. The TypeScript side matches on this exact string
    /// (see <c>session-channel.ts</c>).
    /// </summary>
    public const string Topic = "CK.SessionChannel";

    // The connection identifiers of one user. The inner dictionary is a set (its byte value is never
    // read); a user legitimately has several connections at once.
    readonly ConcurrentDictionary<int, ConcurrentDictionary<string, byte>> _byActor = new();
    // The reverse mapping, so that a closed connection is unindexed without having to ask anyone which
    // user it was bound to. It is also what lets a connection carry no identity of its own.
    readonly ConcurrentDictionary<string, int> _actorByConnection = new();

    WebSocketChannelManager _channel = null!;

    void StObjConstruct( WebSocketChannelManager channel )
    {
        _channel = channel;
    }

    /// <summary>
    /// Subscribes to the channel here rather than in <c>OnHostStart</c>: several hosts can start on the
    /// same StObjMap (tests do), and a subscription per start would pile handlers up. StObjInitialize
    /// runs once per map.
    /// </summary>
    void StObjInitialize( IActivityMonitor monitor, IStObjObjectMap map )
    {
        _channel.ConnectionClosed.Sync += OnConnectionClosed;
    }

    void OnConnectionClosed( IActivityMonitor monitor, ConnectionClosedEvent e ) => Unindex( e.ConnectionId );

    /// <summary>
    /// Handles <see cref="IRegisterSessionCommand"/>: binds the connection to the calling user.
    /// <para>
    /// Reaching this method already means the caller passed every command-handling validator: a user
    /// that some validator refuses (a banished one) never gets its connection bound.
    /// </para>
    /// </summary>
    /// <param name="monitor">The monitor to use.</param>
    /// <param name="command">The registration command.</param>
    [CommandHandler]
    public void HandleRegisterSession( IActivityMonitor monitor, IRegisterSessionCommand command )
    {
        int actorId = command.ActorId.GetValueOrDefault();
        if( _channel.TryGetConnection( command.ConnectionId, out _ ) is false )
        {
            // Also covers the legitimate case of a socket closed between the negotiation and this
            // command: the client renegotiates a new identifier anyway.
            Throw.InvalidDataException( $"Connection {command.ConnectionId} does not exist, or is not identified as you." );
        }
        // Re-registering the same connection is harmless: the client renegotiates on every reconnection
        // and a retry must not create a second index entry.
        if( _actorByConnection.GetOrAdd( command.ConnectionId, actorId ) != actorId )
        {
            Throw.InvalidDataException( $"Connection {command.ConnectionId} is already bound to another user." );
        }
        _byActor.GetOrAdd( actorId, _ => new ConcurrentDictionary<string, byte>() )
                .TryAdd( command.ConnectionId, 0 );

        // The connection can vanish between the check above and this line: the closed event would then
        // have found nothing to unindex, and the entry would stay in the index for the lifetime of the
        // process. Clean up rather than leak.
        if( _channel.TryGetConnection( command.ConnectionId, out _ ) is false )
        {
            Unindex( command.ConnectionId );
            Throw.InvalidDataException( $"Connection {command.ConnectionId} does not exist, or is not identified as you." );
        }
        monitor.Trace( $"Session channel: connection {command.ConnectionId} bound to user {actorId}." );
    }

    /// <inheritdoc />
    public async Task PushAsync( int userId, string type )
    {
        Throw.CheckNotNullOrWhiteSpaceArgument( type );
        if( !_byActor.TryGetValue( userId, out var connectionIds ) ) return;
        var message = CreateTypedMessage( type );
        foreach( var connectionId in connectionIds.Keys )
        {
            await _channel.SendAsync( connectionId, Topic, message ).ConfigureAwait( false );
        }
    }

    static ReadOnlyMemory<byte> CreateTypedMessage( string type )
    {
        var buffer = new ArrayBufferWriter<byte>( 64 );
        using( var writer = new Utf8JsonWriter( buffer ) )
        {
            writer.WriteStartObject();
            writer.WriteString( "type", type );
            writer.WriteEndObject();
            writer.Flush();
        }
        return buffer.WrittenMemory;
    }

    // Removes the connection from the per-user index, and the user entry itself once its last
    // connection is gone: without this the dictionary would keep one empty set per user ever seen.
    void Unindex( string connectionId )
    {
        if( !_actorByConnection.TryRemove( connectionId, out int actorId ) ) return; // Never registered.
        if( _byActor.TryGetValue( actorId, out var connectionIds ) )
        {
            connectionIds.TryRemove( connectionId, out _ );
            if( connectionIds.IsEmpty ) _byActor.TryRemove( actorId, out _ );
        }
    }
}
