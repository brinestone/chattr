import { Signaling } from '@chattr/interfaces';
import { Logger, UnprocessableEntityException, UseFilters, UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from '@nestjs/websockets';
import { DtlsParameters, MediaKind, RtpCapabilities, RtpParameters } from 'mediasoup/node/lib/types';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { Ctx } from '../decorators/extract-from-context.decorator';
import { Roles } from '../decorators/room-role';
import { Events } from '../events';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { RoleGuard } from '../guards/role.guard';
import { WsGuard } from '../guards/ws.guard';
import { Principal } from '../models';
import { RoomService } from '../services/room.service';

function getElevatedChannel(roomId: string) {
  return `elevated::${roomId}`;
}

function getPresenterChannel(roomId: string) {
  return `presenters::${roomId}`;
}

@WebSocketGateway(undefined, { cors: true })
@UseFilters(new WsExceptionFilter())
@UseGuards(WsGuard)
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomGateway.name);
  private readonly statsSubscriptions = new Map<string, Subscription>()
  @WebSocketServer() private server: Server;
  constructor(private roomService: RoomService) { }

  handleConnection(client: Socket) {
    this.logger.log(`${client.id} has connected`);
  }

  async handleDisconnect(client: Socket) {
    const roomId = client.data.roomId;
    if (roomId) {
      const owningSession = client.data['owningSession'];
      const userId: string = client.data['userId'];
      const presenterChannel = getPresenterChannel(roomId);
      await this.roomService.closeSession(owningSession);
      await this.roomService.leaveSessions(userId, ...(client.data['sessions'] ?? []));
      await this.roomService.endUserPresentations(userId, client.data['presentation']);
      client.to(roomId).emit(Signaling.SessionClosed, { sessionId: owningSession });
      client.leave(roomId);
      client.leave(presenterChannel);

      if (this.roomService.isMemberInRoles(userId, roomId, 'moderator', 'owner')) {
        const elevatedChannel = getElevatedChannel(roomId);
        client.leave(elevatedChannel);
      }
    }
    this.logger.log(`${client.id} has disconnected.`);
  }

  @OnEvent(Events.ActiveSessionChanged)
  private onActiveSessionChanged({ roomId, sessionId }: { sessionId: string, roomId: string }) {
    this.server.to(roomId).emit(Signaling.SpeakingSessionChanged, { sessionId });
  }

  @OnEvent(Events.AdmissionPending)
  private onAdmissionPending({ memberId, userId, displayName, avatar, roomId, clientIp }: { memberId: string, clientIp: string, userId: string, displayName: string, avatar?: string, roomId: string }) {
    const elevatedChannel = getElevatedChannel(roomId);
    this.server.to(elevatedChannel).emit(Signaling.AdmissionPending, { userId, displayName, avatar, roomId, memberId, clientIp });
  }

  @OnEvent(Events.PresentationUpdated)
  @OnEvent(Events.PresentationCreated)
  private async onPresentationCreated({ previousPresenter, presenter, id, roomId, timestamp }: { previousPresenter?: string, timestamp: Date, roomId: string, presenter: string, id: string }) {
    const roomSockets = await this.server.in(roomId).fetchSockets();
    if (roomSockets.length == 0)
      return;

    const presenterChannel = getPresenterChannel(roomId);
    const presenterSocket = roomSockets.find(({ data }) => data['userId'] == presenter);
    const previousPresenterSocket = !previousPresenter ? undefined : roomSockets.find(({ data }) => data['userId'] == previousPresenter);
    if (previousPresenterSocket)
      previousPresenterSocket.leave(presenterChannel);
    presenterSocket.join(presenterChannel);

    this.server.to(roomId).except(presenterChannel).emit(Signaling.PresentationUpdated, { presentationId: id, roomId, timestamp });
  }

  @OnEvent(Events.PresentationClosed)
  onPresentationClosed({ id, roomId }: { owner?: string, id: string, roomId: string }) {
    this.server.to(roomId).emit(Signaling.PresentationEnded, { presentationId: id, roomId });
  }

  @SubscribeMessage(Signaling.JoinPresentation)
  async onJoinPresentation(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') { userId }: Principal,
    @MessageBody() { id, roomId }: { id: string, roomId: string }
  ) {
    try {
      const { isOwner, rtpCapabilities, transportParams } = await this.roomService.joinPresentation(userId, id);
      if (isOwner) {
        socket.to(roomId).emit(Signaling.PresentationCreated, id);
        socket.data['presentation'] = id;
        socket.join(getPresenterChannel(roomId));
      }
      return { rtpCapabilities, transportParams, isOwner };
    } catch (err) {
      throw new WsException(err);
    }
  }

  @SubscribeMessage(Signaling.StatsSubscribe)
  createStatsSubscription(
    @ConnectedSocket() socket: Socket,
    @MessageBody() { type, id }: { type: 'consumer' | 'producer', id: string }
  ) {
    const subscription = this.roomService.observeStats(type, id).subscribe({
      next: (update) => {
        socket.emit(Signaling.StatsUpdate, { id, type, update });
      },
      error: (error: Error) => {
        this.logger.error(error.message, error.stack);
        socket.emit(Signaling.StatsEnd, { id });
      },
      complete: () => {
        socket.emit(Signaling.StatsEnd, { id });
      }
    });
    subscription.add(() => {
      this.statsSubscriptions.delete(id);
    });
    this.statsSubscriptions.set(id, subscription);
  }

  @SubscribeMessage(Signaling.LeaveSession)
  async handleSessionLeave(
    @Ctx('user') { userId }: Principal,
    @MessageBody() { sessionId }: { sessionId: string }
  ) {
    try {
      await this.roomService.leaveSessions(userId, sessionId);
    } catch (err) {
      this.logger.error(err.message, err.stack);
    }
  }

  @SubscribeMessage(Signaling.ToggleConsumer)
  async handleConsumerToggling(
    @MessageBody() { consumerId }: { consumerId: string }
  ) {
    try {
      return await this.roomService.toggleConsumer(consumerId);
    } catch (err) {
      this.logger.error(err.message, err.stack);
    }
  }

  @SubscribeMessage(Signaling.ApproveAdmission)
  @UseGuards(RoleGuard)
  @Roles('moderator')
  async handleAdmissionApproval(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') { userId }: Principal,
    @MessageBody() { userId: admittedUserId, displayName, avatar, roomId, clientIp, memberId, status }: { status: boolean, memberId: string, clientIp: string, userId: string, displayName: string, avatar?: string, roomId: string }
  ) {
    try {
      if (status) {
        await this.roomService.admitMember(admittedUserId, memberId, displayName, roomId, clientIp, avatar);
        socket.to(getElevatedChannel(roomId)).emit(Signaling.AdmissionApproved, { approvedBy: userId });
      }
    } catch (err) {
      if (err instanceof UnprocessableEntityException) return;
      else throw new WsException(err);
    }
  }

  @SubscribeMessage(Signaling.CloseConsumer)
  handleConsumerClosing(
    @MessageBody() { consumerId }: { consumerId: string }
  ) {
    try {
      this.roomService.closeConsumer(consumerId);
    } catch (err) {
      this.logger.error(err.message, err.stack);
    }
  }

  @SubscribeMessage(Signaling.CloseProducer)
  async handleProducerClose(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') { userId }: Principal,
    @MessageBody() { sessionId, producerId }: { producerId: string, sessionId: string }
  ) {
    try {
      await this.roomService.closeProducer(userId, sessionId, producerId);
      const roomId = socket.data['roomId'];
      socket.to(roomId).emit(Signaling.ProducerClosed, { sessionId, producerId });
      return {};
    } catch (err) {
      throw new WsException(err);
    }
  }

  @SubscribeMessage(Signaling.CreateProducer)
  async handleProducerCreation(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') principal: Principal,
    @MessageBody() { kind, rtpParameters, sessionId }: { sessionId: string, rtpParameters: RtpParameters, kind: MediaKind }
  ) {
    try {
      const roomId = socket.data['roomId'];
      const ans = await this.roomService.createProducer(sessionId, principal.userId, rtpParameters, kind, roomId);
      this.logger.verbose(`User: ${principal.userId} has created a "${kind}" producer on their session: ${sessionId}. Signaling peers...`);
      socket.to(roomId).emit(Signaling.ProducerOpened, { sessionId, ...ans });
      return ans;
    } catch (err) {
      throw new WsException(err);
    }
  }


  @SubscribeMessage(Signaling.JoinSession)
  async handleJoiningSession(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') principal: Principal,
    @MessageBody() { sessionId, roomId }: { roomId: string, sessionId: string }
  ) {
    try {
      const { params, isSessionOwner, hasElevatedPrivileges } = await this.roomService.joinSession(sessionId, roomId, principal.userId);
      if (hasElevatedPrivileges)
        socket.join(getElevatedChannel(roomId));
      socket.join(roomId);
      socket.data['roomId'] = roomId;
      if (!isSessionOwner) {
        const sessions = new Set<string>(socket.data['sessions'] ?? []);
        sessions.add(sessionId);
        socket.data['sessions'] = [...sessions];
      }
      socket.data['userId'] = principal.userId;

      if (isSessionOwner) {
        socket.data['owningSession'] = sessionId;
        this.logger.verbose(`User: ${principal.userId} has opened their session: ${sessionId}. Signaling room peers`);
        socket.to(roomId).emit(Signaling.SessionOpened, { sessionId })
      }
      return params;
    } catch (err) {
      throw new WsException(err);
    }
  }


  @SubscribeMessage(Signaling.ConnectTransport)
  async handleConnectTransport(
    @Ctx('user') principal: Principal,
    @MessageBody() { dtlsParameters, sessionId }: { dtlsParameters: DtlsParameters; sessionId: string }
  ) {
    try {
      await this.roomService
        .connectTransport(sessionId, dtlsParameters, principal.userId);
      return {};
    } catch (err) {
      throw new WsException(err);
    }
  }


  @SubscribeMessage(Signaling.CreateConsumer)
  async handleCreateConsumer(
    @Ctx('user') { userId }: Principal,
    @MessageBody() { sessionId, producerId, rtpCapabilities }: { sessionId: string, producerId: string, rtpCapabilities: RtpCapabilities }
  ) {
    try {
      return await this.roomService.createConsumer(sessionId, userId, producerId, rtpCapabilities);
    } catch (err) {
      throw new WsException(err);
    }
  }
}
