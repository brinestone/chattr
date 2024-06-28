import { Injectable, inject } from '@angular/core';
import { ConnectionStatus, IRoom, IRoomSession } from '@chattr/interfaces';
import { Action, NgxsOnInit, State, StateContext, select } from '@ngxs/store';
import { append, patch, removeItem } from '@ngxs/store/operators';
import { EMPTY, concatMap, forkJoin, from, of, switchMap, tap, throwError, timer } from 'rxjs';
import { ClearConnectedRoom, CloseServerSideConsumer, CloseServerSideProducer, ConnectToRoom, ConnectTransport, ConnectedRoomChanged, CreateInviteLink, CreateRoom, CreateServerSideConsumer, CreateServerSideProducer, InvitationInfoLoaded, JoinSession, LeaveSession, LoadInvitationInfo, LoadRooms, RemoteSessionClosed, RemoteSessionOpened, ServerSideConsumerCreated, ServerSideProducerCreated, SessionJoined, TransportConnected, UpdateConnectionStatus, UpdateInvite } from '../actions';
import { RoomService } from '../services/room.service';
import { Selectors } from './selectors';

export type ConnectedRoom = {
  info: IRoom;
  session: IRoomSession;
  inviteLink?: string;
  otherSessions: IRoomSession[];
  connectionStatus: ConnectionStatus;
}

export type RoomStateModel = {
  rooms: IRoom[];
  connectedRoom?: ConnectedRoom;
};

type Context = StateContext<RoomStateModel>;
const NO_ROOM_CONNECTED_ERROR = new Error('No room connected')

@Injectable()
@State<RoomStateModel>({
  name: 'room',
  defaults: {
    rooms: []
  },
})
export class RoomState implements NgxsOnInit {
  private readonly accessToken = select(Selectors.accessToken);
  private readonly roomService = inject(RoomService);

  ngxsOnInit(ctx: Context): void {
    ctx.dispatch(ClearConnectedRoom);
  }

  @Action(UpdateInvite, { cancelUncompleted: true })
  onUpdateInvite(_: Context, { accepted, code }: UpdateInvite) {
    return this.roomService.updateInvite(code, accepted);
  }

  @Action(LoadInvitationInfo, { cancelUncompleted: true })
  onLoadInvitationInfo(ctx: Context, { code }: LoadInvitationInfo) {
    return this.roomService.getInvitationInfo(code).pipe(
      tap(res => ctx.dispatch(new InvitationInfoLoaded(res)))
    );
  }

  @Action(CreateInviteLink, { cancelUncompleted: true })
  onCreateInviteLink(ctx: Context, { redirectPath, key }: CreateInviteLink) {
    const { connectedRoom } = ctx.getState()
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);

    const { inviteLink, info: { id } } = connectedRoom;
    if (inviteLink) return EMPTY;

    const redirectUri = new URL(redirectPath, location.origin).toString();
    return this.roomService.createInviteLink(redirectUri, id, key).pipe(
      tap(({ url: inviteLink }) => ctx.setState(patch({
        connectedRoom: patch({
          inviteLink
        })
      })))
    );
  }

  @Action(RemoteSessionOpened)
  onRemoteSessionOpened(ctx: Context, { sessionId }: RemoteSessionOpened) {
    const { connectedRoom } = ctx.getState();
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);
    return this.roomService.findRoomSession(sessionId).pipe(
      tap(session => {
        ctx.setState(patch({
          connectedRoom: patch({
            otherSessions: append([session])
          })
        }))
      })
    )
  }

  @Action(RemoteSessionClosed)
  onRemoteSessionClosed(ctx: Context, { sessionId }: RemoteSessionClosed) {
    ctx.setState(patch({
      connectedRoom: patch({
        otherSessions: removeItem(s => s.id == sessionId)
      })
    }));
  }

  @Action(CloseServerSideConsumer)
  oncloseServerSideConsumer(_: Context, { consumerId }: CloseServerSideConsumer) {
    this.roomService.closeConsumer(consumerId);
  }

  @Action(CloseServerSideProducer)
  onCloseServerSideProducer(_: Context, { producerId, sessionId }: CloseServerSideProducer) {
    return from(this.roomService.closeProducer(sessionId, producerId));
  }

  @Action(CreateServerSideProducer)
  onCreateServerSideProducer(ctx: Context, { kind, rtpParameters, sessionId }: CreateServerSideProducer) {
    const { connectedRoom } = ctx.getState();
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);
    return from(this.roomService.createProducer(sessionId, rtpParameters, kind)).pipe(
      tap(({ producerId }) => ctx.dispatch(new ServerSideProducerCreated(producerId, sessionId, kind)))
    )
  }

  @Action(ConnectTransport)
  onConnectTransport(ctx: Context, { dtlsParameters, sessionId }: ConnectTransport) {
    const { connectedRoom } = ctx.getState();
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);
    return from(this.roomService.connectTransport(sessionId, dtlsParameters)).pipe(
      tap(() => ctx.dispatch(new TransportConnected(sessionId)))
    );
  }

  @Action(CreateServerSideConsumer)
  createServerSideConsumer(ctx: Context, { producerId, sessionId }: CreateServerSideConsumer) {
    return from(this.roomService.createConsumerFor(producerId, sessionId)).pipe(
      tap(({ rtpParameters, kind, id }) => ctx.dispatch(new ServerSideConsumerCreated(id, kind, sessionId, producerId, rtpParameters)))
    );
  }

  @Action(UpdateConnectionStatus, { cancelUncompleted: true })
  onConnectionStatusUpdated(ctx: Context, { status, reason }: UpdateConnectionStatus) {
    if (reason) return throwError(() => new Error(reason));
    ctx.setState(patch({
      connectedRoom: patch({
        connectionStatus: status
      })
    }));
    return EMPTY;
  }

  @Action(LeaveSession)
  onLeaveSession(ctx: Context, { id }: LeaveSession) {
    const connectedRoom = ctx.getState().connectedRoom;
    if (connectedRoom) {
      this.roomService.leaveSession(connectedRoom.info.id, id);
    }
    return EMPTY;
  }

  @Action(JoinSession)
  onJoinSession(ctx: Context, { id }: JoinSession) {
    const roomId = ctx.getState().connectedRoom?.info.id;
    if (!roomId) return throwError(() => 'Room not connected');
    return from(this.roomService.joinSession(roomId, id)).pipe(
      tap(({ transportParams, rtpCapabilities }) => ctx.dispatch(new SessionJoined(transportParams, rtpCapabilities, id)))
    )
  }

  @Action(ConnectedRoomChanged)
  async initializeRoomSessions(ctx: Context) {
    const existingConnectedRoom = ctx.getState().connectedRoom;
    if (existingConnectedRoom) {
      this.roomService.closeExistingConnection();
      this.roomService.establishConnection(this.accessToken());
    }
  }

  @Action(ClearConnectedRoom)
  clearConnectedRoom(ctx: Context) {
    ctx.setState(patch({
      connectedRoom: undefined
    }));

    ctx.dispatch(ConnectedRoomChanged);
  }

  @Action(ConnectToRoom, { cancelUncompleted: true })
  fetchConnectedRoomDetails(ctx: Context, { id: roomId }: ConnectToRoom) {
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
  onCreateRoom(ctx: Context, action: CreateRoom) {
    return this.roomService.createRoom(action.name).pipe(
      tap(() => ctx.dispatch(LoadRooms))
    )
  }

  @Action(LoadRooms, { cancelUncompleted: true })
  onLoadRooms(ctx: Context) {
    return this.roomService.getRooms().pipe(
      tap(rooms => ctx.setState(patch({
        rooms
      })))
    )
  }
}
