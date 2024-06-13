import { Selector, createPropertySelectors } from "@ngxs/store";
import { UserState, UserStateModel } from "./user.state";
import { RoomState, RoomStateModel } from "./room.state";
import { Room } from "@chattr/interfaces";

export class Selectors {
    private static userSlices = createPropertySelectors<UserStateModel>(UserState);
    private static roomSlices = createPropertySelectors<RoomStateModel>(RoomState);

    @Selector([Selectors.userSlices.accessToken])
    static accessToken(token?: string) {
        return token;
    }

    @Selector([Selectors.roomSlices.deviceConfig])
    static devicesConfigured({unconfigured}: {
        audio?: string | undefined;
        video?: string | undefined;
        unconfigured: boolean;
    }) {
        return !unconfigured;
    }

    @Selector([Selectors.roomSlices.rooms])
    static rooms(rooms: Room[]) {
        return rooms;
    }

    @Selector([Selectors.userSlices.isSignedIn])
    static isSignedIn(isSignedIn: boolean) {
        return isSignedIn;
    }
}
