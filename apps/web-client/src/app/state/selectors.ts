import { Selector, createPropertySelectors } from "@ngxs/store";
import { UserState, UserStateModel } from "./user.state";
import { RoomState, RoomStateModel } from "./room.state";
import { ConnectedRoom, Room, RoomMemberSession } from "@chattr/interfaces";
import { DeviceState, DeviceStateModel } from "./devices.state";

export class Selectors {
    private static userSlices = createPropertySelectors<UserStateModel>(UserState);
    private static roomSlices = createPropertySelectors<RoomStateModel>(RoomState);
    private static deviceSlices = createPropertySelectors<DeviceStateModel>(DeviceState);

    @Selector([Selectors.deviceSlices.audio, Selectors.deviceSlices.video])
    static configuredDevices(audio?: string, video?: string) {
        return { video, audio };
    }

    @Selector([Selectors.deviceSlices.video])
    static videoInDevice(video?: string) {
        return video;
    }

    @Selector([Selectors.deviceSlices.audio])
    static audioInDevice(audio?: string) {
        return audio;
    }

    @Selector([Selectors.deviceSlices.configured])
    static devicesConfigured(configured: boolean) {
        return configured;
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



    @Selector([Selectors.roomSlices.rooms])
    static rooms(rooms: Room[]) {
        return rooms;
    }

    @Selector([Selectors.userSlices.isSignedIn])
    static isSignedIn(isSignedIn: boolean) {
        return isSignedIn;
    }
}
