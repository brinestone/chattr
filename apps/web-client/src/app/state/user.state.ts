import { Injectable, inject } from "@angular/core";
import { Action, State, StateContext, Store } from "@ngxs/store";
import { patch } from "@ngxs/store/operators";
import { tap } from "rxjs";
import { SessionUpdated, SignIn } from "../actions";
import { UserService } from "../services/user.service";

export type UserStateModel = {
    sessionId?: string;
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
            const signedIn = this.userService.isSignedIn();
            store.dispatch(new SessionUpdated(signedIn));
        }, 10);
    }

    @Action(SessionUpdated)
    onSessionUpdated(ctx: StateContext<UserStateModel>, { signedIn }: SessionUpdated) {
        ctx.setState(patch({ isSignedIn: signedIn }))
    }

    @Action(SignIn, { cancelUncompleted: true })
    onSignIn(ctx: StateContext<UserStateModel>, action: SignIn) {
        return this.userService.signIn(action).pipe(
            tap(() => ctx.dispatch(new SessionUpdated(true)))
        );
    }
}
