import { Module } from '@nestjs/common';
import { getApp } from 'firebase-admin/app';
import { RoomController } from './controller/room.controller';
import { UserController } from './controller/user.controller';
import { AppGateway } from './gateways/app.gateway';
import { RoomService } from './services/room.service';
import { UserService } from './services/user.service';

@Module({
  imports: [],
  controllers: [RoomController, UserController],
  providers: [RoomService, AppGateway, UserService,
    {
      provide: 'FIREBASE',
      useFactory: () => getApp()
    }
  ],
})
export class AppModule { }
