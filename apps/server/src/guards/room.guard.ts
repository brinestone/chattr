import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RoomService } from '../services/room.service';
import { Socket } from 'socket.io';
import { Request } from 'express';
import { RoomEntity, RoomMemberEntity, UserEntity } from '../models';
import { WsException } from '@nestjs/websockets';

function getRoomIdHeaderValue(context: ExecutionContext) {
  if (context.getType() == 'ws') return context.switchToWs().getClient<Socket>().handshake.headers['x-room-id'];
  return context.switchToHttp().getRequest<Request>().headers['x-room-id'];
}

function getRequest(context: ExecutionContext) {
  if (context.getType() == 'ws') return context.switchToWs().getClient<Socket>().request;
  return context.switchToHttp().getRequest<Request>();
}

@Injectable()
export class RoomGuard implements CanActivate {
  private readonly logger = new Logger(RoomGuard.name);
  constructor(private roomService: RoomService) { }

  async canActivate(context: ExecutionContext) {
    const request = getRequest(context);
    const user = (request as Request & { user?: UserEntity }).user;
    const roomIdHeaderValue = getRoomIdHeaderValue(context);
    if (!roomIdHeaderValue) throw (context.getType() == 'ws' ? new WsException(`403 - Room not specified`) : new ForbiddenException('Room not specified'));

    const roomId = Array.isArray(roomIdHeaderValue) ? roomIdHeaderValue[0] : roomIdHeaderValue;

    try {
      const [room, member] = await this.roomService.validateRoomMembership(roomId, user);
      (request as Request & { room?: RoomEntity }).room = room;
      (request as Request & { member?: RoomMemberEntity }).member = member;
    } catch (err) {
      this.logger.error(err.message);
      throw err;
    }

    return true;
  }
}
