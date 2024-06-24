import { Body, ClassSerializerInterceptor, Controller, Get, Ip, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { Ctx } from '../decorators/room.decorator';
import { JwtGuard } from '../guards/jwt.guard';
import { Principal, UserEntity } from '../models';
import { RoomService } from '../services/room.service';
import { UserService } from '../services/user.service';

@Controller('rooms')
export class RoomController {
  constructor(private roomService: RoomService, private userService: UserService) { }

  @Get(':id/connectable-sessions')
  @UseGuards(JwtGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  async findConnectableSessions(@Param('id') roomId: string, @Ctx('user') user: Principal) {
    return await this.roomService.findConnectableSessionsFor(roomId, user.userId);
  }

  @Get(':id/session')
  @UseGuards(JwtGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  async assertSession(@Ip() clientIp: string, @Ctx('user') principal: Principal, @Param('id') roomId: string) {
    const userDoc = await this.userService.findUserByEmailAsync(principal.email);
    return await this.roomService.assertSession(roomId, principal.userId, clientIp, userDoc.name);
  }

  @Get(':id')
  @UseGuards(JwtGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  async getRoom(@Ctx('user') user: Principal, @Param('id') roomId: string) {
    return await this.roomService.findRoomWithSubscriber(user.userId, roomId);
  }

  @Get()
  @UseGuards(JwtGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  async getRooms(@Ctx('user') principal: Principal) {
    return await this.roomService.getSubscribedRoomsFor(principal.userId);
  }

  @Post()
  @UseGuards(JwtGuard)
  async createRoom(
    @Body() { name }: { name: string },
    @Ctx('user') e: Principal
  ) {
    await this.roomService.createRoom(name, e.userId);
  }
}
