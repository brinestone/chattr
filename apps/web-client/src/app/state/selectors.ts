import { Selector, createPropertySelectors } from "@ngxs/store";
import { UserState, UserStateModel } from "./user.state";
import { RoomState, RoomStateModel } from "./room.state";
import { ConnectedRoom, Room, RoomMemberSession } from "@chattr/interfaces";

export class Selectors {
    private static userSlices = createPropertySelectors<UserStateModel>(UserState);
    private static roomSlices = createPropertySelectors<RoomStateModel>(RoomState);

    @Selector([Selectors.roomSlices.deviceConfig])
    static videoInDevice({ video }: {
        audio?: string | undefined;
        video?: string | undefined;
        unconfigured: boolean;
    }) {
        return video;
    }

    @Selector([Selectors.roomSlices.deviceConfig])
    static audioInDevice({ audio }: {
        audio?: string | undefined;
        video?: string | undefined;
        unconfigured: boolean;
    }) {
        return audio;
    }

    @Selector([Selectors.roomSlices.connectedRoom])
    static producibleSession(room?: ConnectedRoom) {
        return room?.session;
    }

    @Selector([Selectors.roomSlices.connectedRoom])
    static allSessions(room?: ConnectedRoom) {
        const ans = Array<RoomMemberSession>();
        if (room?.session) ans.push(room.session);
        ans.push(...(room?.otherSessions ?? []));
        return ans;
    }

    @Selector([Selectors.userSlices.accessToken])
    static accessToken(token?: string) {
        return token;
    }

    @Selector([Selectors.roomSlices.deviceConfig])
    static devicesConfigured({ unconfigured }: {
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
