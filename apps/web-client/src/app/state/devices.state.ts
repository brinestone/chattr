import { Injectable, inject } from "@angular/core";
import { Action, State, StateContext } from "@ngxs/store";
import { patch } from "@ngxs/store/operators";
import { tap } from "rxjs";
import { DevicesFound, FindDevices, SaveDeviceConfig, SetAudioDevice, SetVideoDevice, ToggleAudio, ToggleVideo } from "../actions";
import { DeviceService } from "../services/device.service";

export type DeviceConfig = {
    disabled: boolean;
    deviceId: string;
}

export interface DeviceStateModel {
    audio?: DeviceConfig;
    video?: DeviceConfig;
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
    private readonly deviceService = inject(DeviceService);

    @Action(ToggleVideo)
    onToggleVideo(ctx: Context) {
        ctx.setState(patch({
            video: patch({
                disabled: !ctx.getState().video?.disabled
            })
        }))
    }

    @Action(ToggleAudio)
    onToggleAudio(ctx: Context) {
        ctx.setState(patch({
            audio: patch({
                disabled: !ctx.getState().audio?.disabled
            })
        }))
    }

    @Action(SaveDeviceConfig)
    onSaveDeviceConfig(ctx: Context) {
        ctx.setState(patch({
            configured: true
        }));
    }

    @Action(SetAudioDevice)
    onSetAudioDevice(ctx: Context, { id }: SetAudioDevice) {
        ctx.setState(patch({
            audio: patch({
                deviceId: id
            })
        }));
        ctx.dispatch(SaveDeviceConfig);
    }

    @Action(SetVideoDevice)
    onSetVideoDevice(ctx: Context, { id }: SetVideoDevice) {
        ctx.setState(patch({
            video: patch({
                deviceId: id
            })
        }))
        ctx.dispatch(SaveDeviceConfig);
    }

    @Action(FindDevices)
    findDevices(ctx: Context) {
        return this.deviceService.findMediaDevices().pipe(
            tap(devices => ctx.dispatch(new DevicesFound(devices)))
        );
    }
}
