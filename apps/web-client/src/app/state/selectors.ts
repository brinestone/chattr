import { IRoom, IRoomSession } from "@chattr/interfaces";
import { Selector, createPropertySelectors } from "@ngxs/store";
import { DeviceConfig, DeviceState, DeviceStateModel } from "./devices.state";
import { ConnectedRoom, RoomState, RoomStateModel } from "./room.state";
import { UserState, UserStateModel } from "./user.state";
import { JwtPayload, jwtDecode } from "jwt-decode";

export class Selectors {
    private static userSlices = createPropertySelectors<UserStateModel>(UserState);
    private static roomSlices = createPropertySelectors<RoomStateModel>(RoomState);
    private static deviceSlices = createPropertySelectors<DeviceStateModel>(DeviceState);

    @Selector([Selectors.roomSlices.connectedRoom])
    static connectedRoomInfo(connectedRoom?: ConnectedRoom) {
        return connectedRoom?.info;
    }

    @Selector([Selectors.userSlices.accessToken])
    static principal(accessToken?: string) {
        if (!accessToken) return undefined;
        const { avatar, displayName, email } = jwtDecode<{ avatar: string, displayName: string, email: string } & JwtPayload>(accessToken);
        return { avatar, displayName, email };
    }

    @Selector([Selectors.roomSlices.connectedRoom])
    static inviteLink(connectedRoom?: ConnectedRoom) {
        return connectedRoom?.inviteLink;
    }

    @Selector([Selectors.deviceSlices.video])
    static isVideoDisabled(video?: DeviceConfig) {
        return video?.disabled ?? false;
    }

    @Selector([Selectors.deviceSlices.audio])
    static isAudioDisabled(audio?: DeviceConfig) {
        return audio?.disabled ?? false;
    }

    @Selector([Selectors.deviceSlices.audio, Selectors.deviceSlices.video])
    static configuredDevices(audio?: DeviceConfig, video?: DeviceConfig) {
        return { video: video?.deviceId, audio: audio?.deviceId };
    }

    @Selector([Selectors.deviceSlices.video])
    static videoInDevice(video?: DeviceConfig) {
        return video?.deviceId;
    }

    @Selector([Selectors.deviceSlices.audio])
    static audioInDevice(audio?: DeviceConfig) {
        return audio?.deviceId;
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
        const ans = Array<IRoomSession>();
        if (room?.session) ans.push(room.session);
        ans.push(...(room?.otherSessions ?? []));
        return ans;
    }

    @Selector([Selectors.userSlices.accessToken])
    static accessToken(token?: string) {
        return token;
    }



    @Selector([Selectors.roomSlices.rooms])
    static rooms(rooms: IRoom[]) {
        return rooms;
    }

    @Selector([Selectors.userSlices.isSignedIn])
    static isSignedIn(isSignedIn: boolean) {
        return isSignedIn;
    }
}
