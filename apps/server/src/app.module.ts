import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './auth/jwt-auth.strategy';
import { LocalStrategy } from './auth/local-auth.strategy';
import { AuthController } from './controller/auth.controller';
import { RoomController } from './controller/room.controller';
import { InvitesController, UpdatesController } from './controller/updates.controller';
import { UserController } from './controller/user.controller';
import { AppGateway } from './gateways/app.gateway';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { Invite, InviteSchema, Notification, NotificationSchema, Room, RoomMemberSchema, RoomMembership, RoomSchema, RoomSession, RoomSessionSchema, Update, UpdateSchema, User, UserSchema } from './models';
import { AuthService } from './services/auth.service';
import { RoomService } from './services/room.service';
import { UpdatesService } from './services/updates.service';
import { UserService } from './services/user.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RoomMembership.name, schema: RoomMemberSchema },
      { name: RoomSession.name, schema: RoomSessionSchema },
      // { name: UserSession.name, schema: SessionSchema },
      { name: Room.name, schema: RoomSchema },
      {
        name: Update.name, schema: UpdateSchema, discriminators: [
          { name: Invite.name, schema: InviteSchema },
          { name: Notification.name, schema: NotificationSchema }
        ]
      }
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
    // EventEmitterModule.forRoot(),
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
  controllers: [RoomController, UserController, InvitesController, AuthController, UpdatesController],
  providers: [
    RoomService,
    AuthService,
    AppGateway,
    UpdatesService,
    JwtStrategy,
    LocalStrategy,
    UserService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
