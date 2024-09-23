import { Injectable, inject } from '@angular/core';
import { ConnectionStatus, IPresentation, IRoom, IRoomSession } from '@chattr/interfaces';
import { Action, Actions, NgxsOnInit, State, StateContext, select } from '@ngxs/store';
import { append, iif, patch, removeItem } from '@ngxs/store/operators';
import { EMPTY, forkJoin, from, map, mergeMap, of, switchMap, tap, throwError } from 'rxjs';
import { ClearConnectedRoom, CloseServerSideConsumer, CloseServerSideProducer, ConnectPresentationTransport, ConnectToRoom, ConnetSessionTransport, ConnectedRoomChanged, ConsumerStreamToggled, CreateInviteLink, CreatePresentation, CreateRoom, CreateServerSideConsumer, CreateServerSideProducer, InvitationInfoLoaded, JoinPresentation, JoinSession, LeaveSession, LoadInvitationInfo, LoadRooms, PresentationJoined, PresentationUpdated, RemoteSessionClosed, RemoteSessionOpened, RoomError, ServerSideConsumerCreated, ServerSideProducerCreated, SessionJoined, StatsSubscribe, ToggleConsumerStream, TransportConnected, UpdateConnectionStatus, UpdateInvite, PresentationTransportConnected, CreatePresentationProducer, PresentationProducerCreated, CreatePresentationConsumer, PresentationConsumerCreated } from '../actions';
import { RoomService } from '../services/room.service';
import { Selectors } from './selectors';

export type ConnectedRoom = {
  info: IRoom;
  session: IRoomSession;
  inviteLink?: string;
  otherSessions: IRoomSession[];
  connectionStatus: ConnectionStatus;
  presentation?: {
    meta: IPresentation;
    isOwner: boolean;
  };
}

export type RoomStateModel = {
  rooms: IRoom[];
  connectedRoom?: ConnectedRoom;
};

type Context = StateContext<RoomStateModel>;
const NO_ROOM_CONNECTED_ERROR = new Error('No room connected');
const NO_PRESENTATION_CONFIGURED = new Error('No presentation configured');

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
  private readonly actions$ = inject(Actions);

  ngxsOnInit(ctx: Context): void {
    ctx.dispatch(ClearConnectedRoom);
  }

  @Action(CreatePresentationConsumer)
  onCreateServerSidePresentationConsumer(ctx: Context, { presentationId, producerId, rtpCapabilities }: CreatePresentationConsumer) {
    return from(this.roomService.createPresentationConsmer(presentationId, producerId, rtpCapabilities)).pipe(
      tap(({ id, rtpParameters }) => ctx.dispatch(new PresentationConsumerCreated(presentationId, producerId, rtpParameters, id)))
    )
  }

  @Action(CreatePresentationProducer)
  onCreatePresentationProducer(ctx: Context, { presentationId, rtpParameters }: CreatePresentationProducer) {
    return from(this.roomService.createPresentationProducer(presentationId, rtpParameters)).pipe(
      tap(({ producerId }) => ctx.dispatch(new PresentationProducerCreated(presentationId, producerId)))
    )
  }

  @Action(ConnectPresentationTransport, { cancelUncompleted: true })
  onConnectPresentationTransport(ctx: Context, { dtlsParameters, presentationId }: ConnectPresentationTransport) {
    return from(this.roomService.connectPresentationTransport(presentationId, dtlsParameters)).pipe(
      tap(() => ctx.dispatch(new PresentationTransportConnected(presentationId)))
    )
  }

  @Action(JoinPresentation, { cancelUncompleted: true })
  onJoinPresentation(ctx: Context, { id }: JoinPresentation) {
    const connectedRoom = ctx.getState().connectedRoom;
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);
    if (!connectedRoom.presentation || connectedRoom.presentation.meta.id != id) return throwError(() => NO_PRESENTATION_CONFIGURED);

    return from(this.roomService.joinPresentation(id, connectedRoom.info.id)).pipe(
      tap(({ rtpCapabilities, transportParams }) => {
        ctx.dispatch(new PresentationJoined(id, transportParams, rtpCapabilities));
      }),
      tap(({ isOwner, id: presentationId }) => {
        ctx.setState(patch({
          connectedRoom: iif(v => v.presentation?.meta.id == presentationId, patch({
            presentation: patch({
              isOwner
            })
          }))
        }))
      })
    )
  }

  @Action(PresentationUpdated)
  fetchPresentationInfoOnCreated(ctx: Context, { id, timestamp }: PresentationUpdated) {
    const connectedRoom = ctx.getState().connectedRoom;
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);

    if (connectedRoom.presentation) {
      const previousoUpdateTimestamp = new Date(connectedRoom.presentation.meta.updatedAt);
      const currentTimestamp = timestamp;
      if (connectedRoom.presentation?.meta.id == id && previousoUpdateTimestamp.valueOf() == currentTimestamp.valueOf()) return EMPTY;
    }
    return this.roomService.findPresentation(id).pipe(
      tap(presentation => ctx.setState(patch({ connectedRoom: patch({ presentation: patch({ meta: presentation }) }) })))
    )
  }

  @Action(CreatePresentation, { cancelUncompleted: true })
  onCreatePresentation(ctx: Context) {
    const connectedRoom = ctx.getState().connectedRoom;
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);

    return this.roomService.createPresentation(connectedRoom.info.id).pipe(
      tap(presentation => ctx.setState(patch({ connectedRoom: patch({ presentation: patch({ meta: presentation }) }) }))),
      tap(({ id, updatedAt }) => ctx.dispatch(new PresentationUpdated(id, updatedAt)))
    );
  }

  @Action(StatsSubscribe)
  onConsumerStatsSubscribe(_: Context, { id, type }: StatsSubscribe) {
    this.roomService.openConsumerStatsStream(id, type);
  }

  @Action(ToggleConsumerStream)
  onToggleConsumerStream(ctx: Context, { consumerId }: ToggleConsumerStream) {
    from(this.roomService.toggleConsumer(consumerId)).pipe(
      tap(({ paused }) => ctx.dispatch(new ConsumerStreamToggled(consumerId, paused)))
    );
  }

  @Action(RoomError)
  onServerError(_: Context, action: RoomError) {
    return throwError(() => action);
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
            otherSessions: iif(sessions => sessions.every(session => session.id != sessionId), append([session]))
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

  @Action(ConnetSessionTransport)
  onConnectTransport(ctx: Context, { dtlsParameters, sessionId }: ConnetSessionTransport) {
    const { connectedRoom } = ctx.getState();
    if (!connectedRoom) return throwError(() => NO_ROOM_CONNECTED_ERROR);

    return from(this.roomService.connectTransport(sessionId, dtlsParameters)).pipe(
      tap(() => {
        ctx.dispatch(new TransportConnected(sessionId));
        // subscription.unsubscribe();
      })
    );
  }

  @Action(CreateServerSideConsumer)
  createServerSideConsumer(ctx: Context, { producerId, sessionId, rtpCapabilities }: CreateServerSideConsumer) {
    return from(this.roomService.createConsumerFor(producerId, sessionId, rtpCapabilities)).pipe(
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
      this.roomService.leaveSession(id);
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
      this.roomService.establishConnection(existingConnectedRoom.info.id, this.accessToken());
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
      mergeMap(existingRoom => {
        if (!existingRoom) return this.roomService.getRoomInfo(roomId);
        return of(existingRoom);
      }),
      switchMap((room) => {
        return forkJoin({
          info: of(room),
          connectionStatus: of('idle' as ConnectionStatus),
          session: this.roomService.assertRoomSession(room.id),
          otherSessions: this.roomService.getConnectableSessions(room.id),
          presentation: this.roomService.getCurrentPresentation(room.id).pipe(
            map(p => !p ? undefined : ({ meta: p, isOwner: false }))
          )
        })
      }),
      tap(connectedRoom => ctx.setState(patch({
        connectedRoom
      }))),
      map(() => ctx.getState().connectedRoom),
      tap((c) => ctx.setState(patch({
        connectedRoom: iif(r => {
          return r?.session.id == c?.presentation?.meta.parentSession
        },
          patch({
            presentation: patch({
              isOwner: true
            })
          })
        )
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
