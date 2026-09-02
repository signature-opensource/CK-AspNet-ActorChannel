import { effect, EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { ActorChannel, AuthLevel, NgAuthService } from '@local/ck-gen';

/**
 * Binds the one ActorChannel of the application to the authenticated actor: it claims its topic as
 * soon as the level reaches Normal, and releases it when the level drops.
 *
 * Following the authentication rather than the application lifetime is not a refinement. There is no
 * actor to bind for an anonymous visitor, and the server refuses the registration of one anyway
 * (IRegisterActorChannelCommand is an ICommandAuthNormal): starting unconditionally would fire
 * onRegisterError on every anonymous page load, which a feature cannot tell apart from a real
 * rejection - a banished user coming back looks exactly the same.
 *
 * The initializer is synchronous. It returns nothing, so the bootstrap does not wait: the channel is a
 * network condition, not a precondition of the application - the same rule WSConnection follows.
 *
 * @returns EnvironmentProviders that keep the ActorChannel bound to the current actor.
 */
export function provideActorChannelSupport(): EnvironmentProviders {
    return makeEnvironmentProviders( [
        provideAppInitializer( bindActorChannelToAuthentication )
    ] );
}

function bindActorChannelToAuthentication(): void {
    const channel = inject( ActorChannel );
    const authService = inject( NgAuthService );
    // Created in the injection context of the environment injector, so it lives as long as the
    // application: reading the signal here is what re-claims the topic after a login and releases it
    // after a logout, without any feature having to care.
    effect( () => {
        if ( authService.authenticationInfo().level >= AuthLevel.Normal ) channel.start();
        else void channel.stopAsync();
    } );
}
