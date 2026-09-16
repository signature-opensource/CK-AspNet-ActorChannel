The Angular half of the actor channel: provides the one `ActorChannel` of the application as an
injectable and starts it while a user is authenticated.

Referencing the package contributes the Angular providers - there is no module to import and no
provider array to edit. A feature injects the channel and registers the message types it handles.

It must never construct one. Two started instances would both claim the channel topic on the shared
socket, the second registration silently replacing the first, and the feature that registered first
would simply stop receiving with nothing to show why.

Binding follows the authentication level: an anonymous visitor has no actor to bind.
