import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RoomService } from '../services/room.service';
import { AuthGuard } from '../guards/auth.guard';
import { Room } from '@chattr/dto';

@Controller('rooms')
export class RoomController {
  constructor(private roomService: RoomService) { }

  @Post()
  @UseGuards(AuthGuard)
  createRoom(@Body() obj: Room) {
    return this.roomService.createRoom(obj);
  }
}
