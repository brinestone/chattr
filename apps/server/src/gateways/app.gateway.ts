import { Room } from '@chattr/interfaces';
import { Logger, UseFilters, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from '@nestjs/websockets';
import {
  DtlsParameters,
  MediaKind,
  RtpParameters,
} from 'mediasoup/node/lib/types';
import { HydratedDocument } from 'mongoose';
import { catchError, tap, throwError } from 'rxjs';
import { Socket } from 'socket.io';
import { Ctx } from '../decorators/room.decorator';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { AuthGuard } from '../guards/auth.guard';
import { RoomGuard } from '../guards/room.guard';
import { RoomDocument, UserDocument } from '../models';
import { RoomService } from '../services/room.service';

function getRoomChannel(room: HydratedDocument<Room>) {
  return `rooms:${room._id.toString()}`;
}

@WebSocketGateway(undefined, { cors: true })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);
  constructor(private roomService: RoomService) {}

  handleConnection(client: Socket, ...args: unknown[]) {
    this.logger.log(`${client.id} connected. Args: ${args}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`${client.id} disconnected.`);
  }

  @UseGuards(AuthGuard, RoomGuard)
  @UseFilters(new WsExceptionFilter())
  @SubscribeMessage('init_session')
  handleMessage(
    @ConnectedSocket() socket: Socket,
    @Ctx('user') user: UserDocument,
    @Ctx('room') room: RoomDocument
  ) {
    const clientIp = socket.request.socket.remoteAddress;
    return this.roomService.assertSession(room, user, clientIp).pipe(
      catchError((error: Error) => throwError(() => new WsException(error))),
      tap(() => {
        const channel = getRoomChannel(room);
        socket.join(channel);
        this.logger.verbose(
          `User: ${user.email} has joined the room: ${room.name}`
        );
      })
    );
  }

  @UseGuards(AuthGuard, RoomGuard)
  @UseFilters(new WsExceptionFilter())
  @SubscribeMessage('connect_transport')
  handleConnectTransport(
    @MessageBody() data: { dtlsParameters: DtlsParameters; sessionId: string }
  ) {
    return this.roomService
      .connectTransport(data)
      .pipe(
        catchError((error: Error) => throwError(() => new WsException(error)))
      );
  }

  @UseGuards(AuthGuard, RoomGuard)
  @UseFilters(new WsExceptionFilter())
  @SubscribeMessage('produce')
  handleProduce(
    @MessageBody()
    data: { rtpParameters: RtpParameters; kind: MediaKind; sessionId: string },
    @Ctx('room') room: RoomDocument,
    @ConnectedSocket() socket: Socket
  ) {
    return this.roomService.createProducer(data).pipe(
      tap((data) => socket.to(getRoomChannel(room)).emit('new_producer', data)),
      catchError((error: Error) => throwError(() => new WsException(error)))
    );
  }
}
