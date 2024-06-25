import { inject } from "@angular/core";
import { CanActivateFn, Params, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { Selectors } from "../state/selectors";

export function authGuard(redirectTo: string, params?: Params): CanActivateFn {
    return (_, state) => {
        const store = inject(Store);
        const router = inject(Router);
        const isSignedIn = store.selectSnapshot(Selectors.isSignedIn);

        return isSignedIn ? true : router.createUrlTree([redirectTo], { queryParamsHandling: 'merge', queryParams: { ...(params ?? {}), 'continue': encodeURIComponent(state.url) } })
    }
}
