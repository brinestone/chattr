import { Injectable, inject } from "@angular/core";
import { Action, State, StateContext, Store } from "@ngxs/store";
import { patch } from "@ngxs/store/operators";
import { tap } from "rxjs";
import { SessionUpdated, SignIn, SignOut, SignUp } from "../actions";
import { UserService } from "../services/user.service";
import { Selectors } from "./selectors";

export type UserStateModel = {
    accessToken?: string;
    isSignedIn: boolean;
}

@Injectable()
@State<UserStateModel>({
    name: 'user',
    defaults: {
        isSignedIn: false
    }
})
export class UserState {
    private readonly userService = inject(UserService);

    constructor(store: Store) {
        setTimeout(() => {
            store.select(Selectors.accessToken).subscribe(token => {
                const signedIn = token ? this.userService.isSignedIn(token) : false;
                store.dispatch(new SessionUpdated(signedIn));
            });
        }, 10);
    }

    @Action(SignUp, { cancelUncompleted: true })
    onSignUp(_: StateContext<UserStateModel>, action: SignUp) {
        return this.userService.signUp(action);
    }

    @Action(SignOut)
    onSignout(ctx: StateContext<UserStateModel>) {
        ctx.setState({ isSignedIn: false });
    }

    @Action(SessionUpdated)
    onSessionUpdated(ctx: StateContext<UserStateModel>, { signedIn }: SessionUpdated) {
        ctx.setState(patch({ isSignedIn: signedIn }))
    }

    @Action(SignIn, { cancelUncompleted: true })
    onSignIn(ctx: StateContext<UserStateModel>, action: SignIn) {
        return this.userService.signIn(action).pipe(
            tap(({ access_token }) => ctx.setState(patch({ accessToken: access_token }))),
            tap(() => ctx.dispatch(new SessionUpdated(true))),
        );
    }
}
