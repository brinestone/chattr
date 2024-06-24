import { Injectable, inject } from '@angular/core';
import { ConnectedRoom, ConnectionStatus, Room } from '@chattr/interfaces';
import { Action, NgxsOnInit, State, StateContext, select } from '@ngxs/store';
import { patch } from '@ngxs/store/operators';
import { EMPTY, concatMap, forkJoin, from, map, of, switchMap, tap, throwError } from 'rxjs';
import { CreateRoom, LoadRooms, SaveDeviceConfig, SetAudioDevice, ConnectToRoom, SetVideoDevice, ConnectedRoomChanged, JoinSession, SessionJoined, ClearConnectedRoom, LeaveSession, UpdateConnectionStatus, CreateServerSideConsumer, ServerSideConsumerCreated } from '../actions';
import { RoomService } from '../services/room.service';
import { Selectors } from './selectors';

export type RoomStateModel = {
  deviceConfig: {
    audio?: string;
    video?: string;
    unconfigured: boolean;
  };
  rooms: Room[];
  connectedRoom?: ConnectedRoom;
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
export class RoomState implements NgxsOnInit {
  private readonly accessToken = select(Selectors.accessToken);
  private readonly roomService = inject(RoomService);

  ngxsOnInit(ctx: StateContext<RoomStateModel>): void {
    ctx.dispatch(ClearConnectedRoom);
  }

  @Action(CreateServerSideConsumer)
  createServerSideConsumer(ctx: StateContext<RoomStateModel>, { producerId, sessionId }: CreateServerSideConsumer) {
    return from(this.roomService.createConsumerFor(producerId, sessionId)).pipe(
      tap(({ rtpParameters, kind, id }) => ctx.dispatch(new ServerSideConsumerCreated(id, kind, sessionId, producerId, rtpParameters)))
    );
  }

  @Action(UpdateConnectionStatus, { cancelUncompleted: true })
  onConnectionStatusUpdated(ctx: StateContext<RoomStateModel>, { status, reason }: UpdateConnectionStatus) {
    if (reason) return throwError(() => new Error(reason));
    ctx.setState(patch({
      connectedRoom: patch({
        connectionStatus: status
      })
    }));
    return EMPTY;
  }

  @Action(LeaveSession)
  onLeaveSession(ctx: StateContext<RoomStateModel>, { id }: LeaveSession) {
    const connectedRoom = ctx.getState().connectedRoom;
    if (connectedRoom) {
      this.roomService.leaveSession(connectedRoom.info.id, id);
    }
    return EMPTY;
  }

  @Action(JoinSession)
  onJoinSession(ctx: StateContext<RoomStateModel>, { id }: JoinSession) {
    const roomId = ctx.getState().connectedRoom?.info.id;
    if (!roomId) return throwError(() => 'Room not connected');
    return from(this.roomService.joinSession(roomId, id)).pipe(
      tap(({ transportParams, rtpCapabilities }) => ctx.dispatch(new SessionJoined(transportParams, rtpCapabilities, id)))
    )
  }

  @Action(ConnectedRoomChanged)
  async initializeRoomSessions(ctx: StateContext<RoomStateModel>) {
    const existingConnectedRoom = ctx.getState().connectedRoom;
    if (existingConnectedRoom) {
      this.roomService.closeExistingConnection();
    }
    this.roomService.establishConnection(this.accessToken())
  }

  @Action(ClearConnectedRoom)
  clearConnectedRoom(ctx: StateContext<RoomStateModel>) {
    ctx.setState(patch({
      connectedRoom: undefined
    }));

    ctx.dispatch(ConnectedRoomChanged);
  }

  @Action(ConnectToRoom, { cancelUncompleted: true })
  fetchConnectedRoomDetails(ctx: StateContext<RoomStateModel>, { id: roomId }: ConnectToRoom) {
    return of(ctx.getState().rooms.find(r => r.id == roomId)).pipe(
      concatMap(existingRoom => {
        if (!existingRoom) return this.roomService.getRoomInfo(roomId);
        return of(existingRoom);
      }),
      switchMap((room) => {
        return forkJoin({
          info: of(room),
          connectionStatus: of('idle' as ConnectionStatus),
          session: this.roomService.assertRoomSession(room.id),
          otherSessions: this.roomService.getConnectableSessions(room.id)
        })
      }),
      tap(connectedRoom => ctx.setState(patch({
        connectedRoom
      }))),
      tap(() => ctx.dispatch(ConnectedRoomChanged))
    )
  }

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
