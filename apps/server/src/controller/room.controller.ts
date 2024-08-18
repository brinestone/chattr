import { CreateInviteRequest } from '@chattr/dto';
import { Body, ClassSerializerInterceptor, Controller, Get, Ip, Param, Post, Put, UseGuards, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { Ctx } from '../decorators/extract-from-context.decorator';
import { JwtGuard } from '../guards/jwt.guard';
import { Principal } from '../models';
import { RoomService } from '../services/room.service';
import { UserService } from '../services/user.service';

@Controller('rooms')
@UseGuards(JwtGuard)
export class RoomController {
  constructor(private roomService: RoomService, private userService: UserService) { }

  @Get(':roomId/presentations/current')
  @UseInterceptors(ClassSerializerInterceptor)
  async getCurrentPresentation(
    @Param('roomId') roomId: string
  ) {
    return await this.roomService.findCurrentPresentation(roomId);
  }

  @Get('presentations/:presentationId')
  @UseInterceptors(ClassSerializerInterceptor)
  async getPresentation(
    @Param('presentationId') presentationId: string
  ) {
    return await this.roomService.findPresentation(presentationId);
  }

  @Put(':roomId/present')
  @UseInterceptors(ClassSerializerInterceptor)
  async startPresentation(
    @Ctx('user') { userId }: Principal,
    @Param('roomId') roomId: string
  ) {
    return await this.roomService.assertPresentation(roomId, userId)
  }

  @Post('invite')
  async createInvite(
    @Ctx('user') { userId }: Principal,
    @Body(new ValidationPipe({ transform: true })) data: CreateInviteRequest
  ) {
    const url = await this.roomService.createInvite(data, userId);
    return { url };
  }

  @Get('sessions/:session')
  @UseInterceptors(ClassSerializerInterceptor)
  async findRoomSession(
    @Param('session') sessionId: string
  ) {
    return await this.roomService.findSessionById(sessionId);
  }

  @Get(':id/connectable-sessions')
  @UseInterceptors(ClassSerializerInterceptor)
  async findConnectableSessions(@Param('id') roomId: string, @Ctx('user') { userId }: Principal) {
    return await this.roomService.findConnectableSessionsFor(roomId, userId);
  }

  @Get(':id/session')
  @UseInterceptors(ClassSerializerInterceptor)
  async assertSession(@Ip() clientIp: string, @Ctx('user') { userId, displayName }: Principal, @Param('id') roomId: string) {
    return await this.roomService.assertSession(roomId, userId, clientIp, displayName);
  }

  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  async getRoom(@Ctx('user') user: Principal, @Param('id') roomId: string) {
    return await this.roomService.findRoomWithSubscriber(user.userId, roomId);
  }

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  async getRooms(@Ctx('user') principal: Principal) {
    return await this.roomService.getSubscribedRoomsFor(principal.userId);
  }

  @Post()
  async createRoom(
    @Body() { name }: { name: string },
    @Ctx('user') e: Principal
  ) {
    await this.roomService.createRoom(name, e.userId);
  }
}
