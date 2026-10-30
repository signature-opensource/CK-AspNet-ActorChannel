# CK.Ng.AspNet.ActorChannel

**Deprecated, without replacement.** This package is a tombstone: it has no code, and a project that depends on it
(directly or through another package) fails to build with the `CKDEPRECATED` error.

The push to the connected actors is removed: tracking the live connections of the users across the parties of a
distributed application (and interacting with them) needs its own design. Remove the reference, and the push of your
features (a banishment, for instance, is enforced by the authentication center: the banished user's commands and
session refresh are refused).

The generic WebSocket channel stays: [CK.AspNet.WebSocketChannel](https://github.com/signature-opensource/CK-AspNet/blob/stable/CK.AspNet.WebSocketChannel/README.md).
