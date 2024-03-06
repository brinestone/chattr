import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { AppGateway } from './app.gateway';
import { RoomController } from './room.controller';

@Module({
  imports: [],
  controllers: [RoomController],
  providers: [RoomService, AppGateway],
})
export class AppModule {}
