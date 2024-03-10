import { Logger, UseFilters, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Ctx } from '../decorators/room.decorator';
import { AuthGuard } from '../guards/auth.guard';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { RoomGuard } from '../guards/room.guard';
import { RoomService } from '../services/room.service';
import { Room, User } from '@chattr/dto';

@WebSocketGateway(undefined, { cors: true })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);
  constructor(private roomService: RoomService) { }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`${client.id} connected. Args: ${args}`)
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`${client.id} disconnected.`);
  }

  @UseGuards(AuthGuard, RoomGuard)
  @UseFilters(new WsExceptionFilter())
  @SubscribeMessage('init_session')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: any,
    @Ctx('user') user: User,
    @Ctx('room') room: Room
  ) {
    console.log(message, user, room);
    return JSON.stringify({ event: 'message', clientId: client.id });
  }
}
