import { User } from '@chattr/dto';
import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { Ctx } from '../decorators/room.decorator';
import { AuthGuard } from '../guards/auth.guard';
import { RoomService } from '../services/room.service';

@Controller('rooms')
export class RoomController {
  constructor(private roomService: RoomService) {}

  @Post()
  @UseGuards(AuthGuard)
  createRoom(@Body() { name }: { name: string }, @Ctx('user') { uid }: User) {
    return this.roomService.createRoom(name, uid as string);
  }
}
