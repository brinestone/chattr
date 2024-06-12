import { Injectable, inject } from "@angular/core";
import { Action, State, StateContext } from "@ngxs/store";
import { UserService } from "../services/user.service";
import { SessionUpdated, SignIn } from "../actions";
import { Cookie } from 'ng2-cookies';
import { tap } from "rxjs";
import { patch } from "@ngxs/store/operators";

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

    constructor() {
        
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
