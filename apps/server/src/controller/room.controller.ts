import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Ctx } from '../decorators/room.decorator';
import { JwtGuard } from '../guards/jwt.guard';
import { UserEntity } from '../models';
import { RoomService } from '../services/room.service';

@Controller('rooms')
export class RoomController {
  constructor(private roomService: RoomService) { }

  @Post()
  @UseGuards(JwtGuard)
  async createRoom(
    @Body() { name }: { name: string },
    @Ctx('user') e: UserEntity
  ) {
    return await this.roomService.createRoom(name, e);
  }
}
