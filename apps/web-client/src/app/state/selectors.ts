import { Selector, createPropertySelectors } from "@ngxs/store";
import { UserState, UserStateModel } from "./user.state";

export class Selectors {
    private static userSlices = createPropertySelectors<UserStateModel>(UserState);

    @Selector([Selectors.userSlices.isSignedIn])
    static isSignedIn(isSignedIn: boolean) {
        return isSignedIn;
    }
}
