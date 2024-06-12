import { User } from '@chattr/interfaces';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Ctx } from '../decorators/room.decorator';
import { AuthGuard } from '../guards/auth.guard';
import { RoomService } from '../services/room.service';
import { HydratedDocument } from 'mongoose';

@Controller('rooms')
export class RoomController {
  constructor(private roomService: RoomService) {}

  @Post()
  @UseGuards(AuthGuard)
  async createRoom(
    @Body() { name }: { name: string },
    @Ctx('user') { id }: HydratedDocument<User>
  ) {
    return await this.roomService.createRoom(name, id);
  }
}
