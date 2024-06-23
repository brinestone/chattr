import { Injectable, inject } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { CreateRoom, LoadRooms, SaveDeviceConfig, SetAudioDevice, SetVideoDevice } from '../actions';
import { RoomService } from '../services/room.service';
import { Room } from '@chattr/interfaces';
import { tap } from 'rxjs';
import { patch } from '@ngxs/store/operators';

export type RoomStateModel = {
  deviceConfig: {
    audio?: string;
    video?: string;
    unconfigured: boolean;
  };
  rooms: Room[];
  connectedRoom?: Room;
};

@Injectable()
@State<RoomStateModel>({
  name: 'room',
  defaults: {
    rooms: [],
    deviceConfig: {
      unconfigured: true,
    },
  },
})
export class RoomState {

  private readonly roomService = inject(RoomService);

  @Action(CreateRoom, { cancelUncompleted: true })
  onCreateRoom(ctx: StateContext<RoomStateModel>, action: CreateRoom) {
    return this.roomService.createRoom(action.name).pipe(
      tap(() => ctx.dispatch(LoadRooms))
    )
  }

  @Action(LoadRooms, { cancelUncompleted: true })
  onLoadRooms(ctx: StateContext<RoomStateModel>) {
    return this.roomService.getRooms().pipe(
      tap(rooms => ctx.setState(patch({
        rooms
      })))
    )
  }

  @Action(SaveDeviceConfig)
  onSaveDeviceConfig(ctx: StateContext<RoomStateModel>) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, unconfigured: false }
    });
  }

  @Action(SetAudioDevice)
  onSetAudioDevice(ctx: StateContext<RoomStateModel>, { id }: SetAudioDevice) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, audio: id },
    });
  }

  @Action(SetVideoDevice)
  onSetVideoDevice(ctx: StateContext<RoomStateModel>, { id }: SetVideoDevice) {
    const currentState = ctx.getState();
    ctx.patchState({
      deviceConfig: { ...currentState.deviceConfig, video: id },
    });
  }
}
