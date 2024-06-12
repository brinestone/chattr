import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, MongooseModuleOptions, getConnectionToken } from '@nestjs/mongoose';
import MongoStore from 'connect-mongo';
import { Connection } from 'mongoose';
import { NestSessionOptions, SessionModule } from 'nestjs-session';
import { RoomController } from './controller/room.controller';
import { UserController } from './controller/user.controller';
import { AppGateway } from './gateways/app.gateway';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { RoomEntity, RoomMemberEntity, RoomMemberSchema, RoomSchema, RoomSessionEntity, RoomSessionSchema, SessionSchema, UserEntity, UserSchema, UserSession } from './models';
import { RoomService } from './services/room.service';
import { UserService } from './services/user.service';

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
    SessionModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, getConnectionToken()],
      useFactory: async (configService: ConfigService, connection: Connection): Promise<NestSessionOptions> => {
        return {
          session: {
            resave: false,
            saveUninitialized: false,
            secret: configService.getOrThrow<string>('SESSION_KEY'),
            store: MongoStore.create({
              autoRemove: 'native',
              client: connection.getClient(),
              collectionName: 'sessions',
            })
          }
        }
      }
    }),
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
  controllers: [RoomController, UserController],
  providers: [
    RoomService,
    AppGateway,
    UserService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware);
  }
}
