import { Controller } from '@nestjs/common';
import { RoomService } from '../services/room.service';

@Controller('rooms')
export class RoomController {
    constructor(private roomService: RoomService){}
}
