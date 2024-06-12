import { Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { SaveDeviceConfig, SetAudioDevice, SetVideoDevice } from '../actions';

export type DeviceStateModel = {
  deviceConfig: {
    audio?: string;
    video?: string;
    unconfigured: boolean;
  };
};

@Injectable()
@State<DeviceStateModel>({
  name: 'devices',
  defaults: {
    deviceConfig: {
      unconfigured: true,
    },
  },
})
export class DevicesState {

  @Action(SaveDeviceConfig)
  onSaveDeviceConfig(ctx: StateContext<DeviceStateModel>) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, unconfigured: false }
    });
  }

  @Action(SetAudioDevice)
  onSetAudioDevice(ctx: StateContext<DeviceStateModel>, { id }: SetAudioDevice) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, audio: id },
    });
  }

  @Action(SetVideoDevice)
  onSetVideoDevice(ctx: StateContext<DeviceStateModel>, { id }: SetVideoDevice) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, video: id },
    });
  }
}
