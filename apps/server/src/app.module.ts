import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './auth/jwt-auth.strategy';
import { LocalStrategy } from './auth/local-auth.strategy';
import { RoomController } from './controller/room.controller';
import { UserController } from './controller/user.controller';
import { AppGateway } from './gateways/app.gateway';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { RoomEntity, RoomMemberEntity, RoomMemberSchema, RoomSchema, RoomSessionEntity, RoomSessionSchema, SessionSchema, UserEntity, UserSchema, UserSession } from './models';
import { AuthService } from './services/auth.service';
import { RoomService } from './services/room.service';
import { UserService } from './services/user.service';
import { AuthController } from './controller/auth.controller';

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
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.getOrThrow<string>('SESSION_KEY'),
          signOptions: { expiresIn: '14d' }
        } as JwtModuleOptions;
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
  controllers: [RoomController, UserController, AuthController],
  providers: [
    RoomService,
    AuthService,
    AppGateway, JwtStrategy,
    LocalStrategy,
    UserService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
