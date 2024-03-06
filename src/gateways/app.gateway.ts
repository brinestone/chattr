import { Logger, UseFilters, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WsAuthGuard } from '../guards/ws-auth.guard';
import { RoomGuard } from '../guards/room.guard';
import { RoomService } from '../services/room.service';
import { WsExceptionFilter } from '../filters/ws-exception.filter';

@WebSocketGateway()
export class AppGateway {
  private readonly logger = new Logger(AppGateway.name);
  constructor(private roomService: RoomService) { }

  @UseGuards(WsAuthGuard, RoomGuard)
  @UseFilters(new WsExceptionFilter)
  @SubscribeMessage('message')
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() message: any) {
    console.log(message);
    return JSON.stringify({ event: 'message', clientId: client.id });
  }
}
