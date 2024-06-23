import { Body, ClassSerializerInterceptor, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { Ctx } from '../decorators/room.decorator';
import { JwtGuard } from '../guards/jwt.guard';
import { UserEntity } from '../models';
import { RoomService } from '../services/room.service';

@Controller('rooms')
export class RoomController {
  constructor(private roomService: RoomService) { }

  @Get()
  @UseGuards(JwtGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  async getRooms(@Ctx('user') user: UserEntity) {
    return await this.roomService.getSubscribedRoomsFor(user.id);
  }

  @Post()
  @UseGuards(JwtGuard)
  async createRoom(
    @Body() { name }: { name: string },
    @Ctx('user') e: UserEntity
  ) {
    await this.roomService.createRoom(name, e);
  }
}
