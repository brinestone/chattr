import { Injectable } from "@angular/core";
import { Action, State, StateContext } from "@ngxs/store";
import { patch } from "@ngxs/store/operators";
import { SaveDeviceConfig, SetAudioDevice, SetVideoDevice } from "../actions";

export interface DeviceStateModel {
    audio?: string;
    video?: string;
    configured: boolean;
}

type Context = StateContext<DeviceStateModel>;

@Injectable()
@State<DeviceStateModel>({
    name: 'devices',
    defaults: {
        configured: false
    }
})
export class DeviceState {
    @Action(SaveDeviceConfig)
    onSaveDeviceConfig(ctx: Context) {
        ctx.setState(patch({
            configured: true
        }));
    }

    @Action(SetAudioDevice)
    onSetAudioDevice(ctx: Context, { id }: SetAudioDevice) {
        ctx.setState(patch({
            audio: id
        }));
        ctx.dispatch(SaveDeviceConfig);
    }

    @Action(SetVideoDevice)
    onSetVideoDevice(ctx: Context, { id }: SetVideoDevice) {
        ctx.setState(patch({
            video: id
        }))
        ctx.dispatch(SaveDeviceConfig);
    }
}
