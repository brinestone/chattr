import { Room, Signaling } from '@chattr/interfaces';
import { Logger, UseFilters, UseGuards } from '@nestjs/common';
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
import { HydratedDocument } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { Ctx } from '../decorators/room.decorator';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { WsGuard } from '../guards/ws.guard';
import { Principal } from '../models';
import { RoomService } from '../services/room.service';
import { DtlsParameters, RtpCapabilities } from 'mediasoup/node/lib/types';

function getRoomChannel(room: HydratedDocument<Room>) {
  return `rooms:${room._id.toString()}`;
}

@WebSocketGateway(undefined, { cors: true })
@UseFilters(new WsExceptionFilter())
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);
  constructor(private roomService: RoomService) { }

  handleConnection(client: Socket) {
    this.logger.log(`${client.id} has connected`);
  }

  async handleDisconnect(client: Socket) {
    const roomId = client.data.roomId;
    if (roomId) {
      const owningSession = client.data['owningSession'];
      await this.roomService.closeSession(owningSession);
      // await this.roomService.leaveSessions(roomId, client.data['sessions']);
      client.to(roomId).emit(Signaling.SessionClosed, owningSession);
      client.leave(roomId);
    }
    this.logger.log(`${client.id} has disconnected.`);
  }

  @UseGuards(WsGuard)
  @SubscribeMessage(Signaling.JoinSession)
  async handleJoiningSession(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') principal: Principal,
    @MessageBody() { sessionId, roomId }: { roomId: string, sessionId: string }
  ) {
    try {
      const { params, isSessionOwner } = await this.roomService.joinSession(sessionId, roomId, principal.userId);
      socket.join(roomId);
      socket.data['roomId'] = roomId;
      if (!isSessionOwner)
        socket.data['sessions'] = [...(socket.data['sessions'] ?? []), sessionId];
      else socket.data['owningSession'] = sessionId;
      socket.data['userId'] = principal.userId;
      return params;
    } catch (err) {
      throw new WsException(err);
    }
  }

  @UseGuards(WsGuard)
  // @UseFilters(new WsExceptionFilter())
  @SubscribeMessage(Signaling.ConnectTransport)
  async handleConnectTransport(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') principal: Principal,
    @MessageBody() { dtlsParameters, sessionId }: { dtlsParameters: DtlsParameters; sessionId: string }
  ) {
    try {
      await this.roomService
        .connectTransport(sessionId, dtlsParameters, principal.userId);
      const roomId = socket.data['roomId'];
      if (await this.roomService.isSessionOwner(sessionId, principal.userId)) {
        this.logger.verbose('Signaling peers in room: ' + roomId);
        socket.to(roomId).emit(Signaling.SessionStarted, { sessionId })
      }
    } catch (err) {
      this.logger.error(err.message, err.stack);
      throw new WsException(err);
    }
  }

  @UseGuards(WsGuard)
  @SubscribeMessage(Signaling.CreateConsumer)
  async handleCreateConsumer(
    @Ctx('user') { userId }: Principal,
    @MessageBody() { sessionId, producerId, rtpCapabilities }: { sessionId: string, producerId: string, rtpCapabilities: RtpCapabilities }
  ) {
    try {
      return await this.roomService.createConsumer(sessionId, userId, producerId, rtpCapabilities);
    } catch (err) {
      this.logger.error(err.message, err.stack);
      throw new WsException(err);
    }
  }

  // @UseGuards(JwtGuard, RoomGuard)
  // @UseFilters(new WsExceptionFilter())
  // @SubscribeMessage('produce')
  // handleProduce(
  //   @MessageBody()
  //   data: { rtpParameters: RtpParameters; kind: MediaKind; sessionId: string },
  //   @Ctx('room') room: RoomDocument,
  //   @ConnectedSocket() socket: Socket
  // ) {
  //   return this.roomService.createProducer(data).pipe(
  //     tap((data) => socket.to(getRoomChannel(room)).emit('new_producer', data)),
  //     catchError((error: Error) => throwError(() => new WsException(error)))
  //   );
  // }
}
