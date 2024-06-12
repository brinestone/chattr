import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { RoomController } from './controller/room.controller';
import { AppGateway } from './gateways/app.gateway';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RoomService } from './services/room.service';
import { RoomEntity, RoomMemberEntity, RoomMemberSchema, RoomSchema, RoomSessionEntity, RoomSessionSchema, SessionSchema, UserEntity, UserSchema, UserSession } from './models';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: RoomMemberEntity.name, schema: RoomMemberSchema },
      { name: RoomSessionEntity.name, schema: RoomSessionSchema },
      { name: UserSession.name, schema: SessionSchema },
      { name: RoomEntity.name, schema: RoomSchema }
    ])
  ],
  exports: [
    MongooseModule
  ]
})
class DataModule { }

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [
        ConfigModule
      ],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        return await Promise.resolve({
          uri: configService.getOrThrow<string>('DB_URI'),
          dbName: configService.getOrThrow<string>('DB_NAME'),
        } as MongooseModuleOptions);
      }
    }),
    DataModule
  ],
  controllers: [RoomController],
  providers: [
    RoomService,
    AppGateway,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware);
  }
}
