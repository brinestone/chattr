import { Logger, UseFilters, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Ctx } from 'src/decorators/room.decorator';
import { AuthGuard } from 'src/guards/auth.guard';
import { Room, User } from 'src/models';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { RoomGuard } from '../guards/room.guard';
import { RoomService } from '../services/room.service';

@WebSocketGateway()
export class AppGateway {
  private readonly logger = new Logger(AppGateway.name);
  constructor(private roomService: RoomService) { }

  @UseGuards(AuthGuard, RoomGuard)
  @UseFilters(new WsExceptionFilter())
  @SubscribeMessage('init_session')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: any,
    @Ctx('user') user: User,
    @Ctx('room') room: Room
  ) {
    console.log(message);
    return JSON.stringify({ event: 'message', clientId: client.id });
  }
}
