Binds the connections of the application-wide WebSocket channel to their user, so a feature can
signal one person on every socket bound to them - several tabs, several devices - knowing only
a user identifier.

The socket stays anonymous: it returns a connection identifier, and the identity is bound afterwards
by an authenticated command carrying that identifier. No credential ever transits through a socket
URL, and because the binding is renewed on every reconnection, the validators registered for that
command run again each time.

What travels is a type name and nothing else: the client learns something happened and goes and asks.
