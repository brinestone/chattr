import { Injectable, inject } from "@angular/core";
import { Action, NgxsOnInit, State, StateContext } from "@ngxs/store";
import { append, patch } from "@ngxs/store/operators";
import { EMPTY, Subscription, tap } from "rxjs";
import { SignIn, SignOut, SignUp, UserSessionUpdated } from "../actions";
import { UserService } from "../services/user.service";
import { INotification } from "@chattr/interfaces";


export type UserStateModel = {
    accessToken?: string;
    isSignedIn: boolean;
    notifications: INotification[];
}

type Context = StateContext<UserStateModel>;

@Injectable()
@State<UserStateModel>({
    name: 'user',
    defaults: {
        isSignedIn: false,
        notifications: []
    }
})
export class UserState implements NgxsOnInit {
    private readonly userService = inject(UserService);
    private liveNotificationsSubscription?: Subscription;

    ngxsOnInit(ctx: Context): void {
        const { accessToken } = ctx.getState();
        const isSignedIn = accessToken ? this.userService.isSignedIn(accessToken) : false;
        ctx.dispatch(new UserSessionUpdated(isSignedIn));
    }

    @Action(SignOut)
    stopLiveNotifications(_: Context) {
        this.liveNotificationsSubscription?.unsubscribe();
    }

    @Action(UserSessionUpdated)
    listenToNotifications(ctx: Context, { signedIn }: UserSessionUpdated) {
        const { accessToken } = ctx.getState();
        if (!signedIn || !accessToken) return;
        this.liveNotificationsSubscription = this.userService.getLiveNotifications(accessToken).subscribe(notification => {
            ctx.setState(patch({
                notifications: append([notification])
            }))
        });
    }

    @Action(UserSessionUpdated)
    getNotifications(ctx: Context, { signedIn }: UserSessionUpdated) {
        if (!signedIn) return EMPTY;
        return this.userService.getNotifications().pipe(
            tap(notifications => ctx.setState(patch({
                notifications
            })))
        )
    }

    @Action(SignUp, { cancelUncompleted: true })
    onSignUp(_: Context, action: SignUp) {
        return this.userService.signUp(action);
    }

    @Action(SignOut)
    onSignout(ctx: Context) {
        ctx.setState({ isSignedIn: false, notifications: [] });
    }

    @Action(UserSessionUpdated)
    onSessionUpdated(ctx: Context, { signedIn }: UserSessionUpdated) {
        ctx.setState(patch({ isSignedIn: signedIn }))
    }

    @Action(SignIn, { cancelUncompleted: true })
    onSignIn(ctx: Context, action: SignIn) {
        return this.userService.signIn(action).pipe(
            tap(({ access_token }) => ctx.setState(patch({ accessToken: access_token }))),
            tap(() => ctx.dispatch(new UserSessionUpdated(true))),
        );
    }
}
