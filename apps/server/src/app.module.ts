import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { getApp } from 'firebase-admin/app';
import { RoomController } from './controller/room.controller';
import { AppGateway } from './gateways/app.gateway';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { RoomService } from './services/room.service';

@Module({
  imports: [],
  controllers: [RoomController/* UserController */],
  providers: [
    RoomService,
    AppGateway /* UserService */,
    {
      provide: 'FIREBASE',
      useFactory: () => getApp(),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware);
  }
}
