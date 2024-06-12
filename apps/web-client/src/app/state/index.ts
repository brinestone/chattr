import { Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { SaveDeviceConfig, SetAudioDevice, SetVideoDevice } from '../actions';

export type AppStateModel = {
  deviceConfig: {
    audio?: string;
    video?: string;
    unconfigured: boolean;
  };
};

@Injectable()
@State<AppStateModel>({
  name: 'appConfig',
  defaults: {
    deviceConfig: {
      unconfigured: true,
    },
  },
})
export class AppState {

  @Action(SaveDeviceConfig)
  onSaveDeviceConfig(ctx: StateContext<AppStateModel>) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, unconfigured: false }
    });
  }

  @Action(SetAudioDevice)
  onSetAudioDevice(ctx: StateContext<AppStateModel>, { id }: SetAudioDevice) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, audio: id },
    });
  }

  @Action(SetVideoDevice)
  onSetVideoDevice(ctx: StateContext<AppStateModel>, { id }: SetVideoDevice) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, video: id },
    });
  }
}
