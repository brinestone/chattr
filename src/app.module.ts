import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { AppGateway } from './app.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [RoomService, AppGateway],
})
export class AppModule {}
