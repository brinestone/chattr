import { Module } from '@nestjs/common';
import { AdminModule } from '@adminjs/nestjs';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as AdminJSMongoose from '@adminjs/mongoose'
import AdminJS from 'adminjs'
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import provider from './admin/auth-provider.js';
import options from './admin/options.js';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';

AdminJS.registerAdapter({
  Resource: AdminJSMongoose.Resource,
  Database: AdminJSMongoose.Database
})

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        return {
          uri: configService.getOrThrow<string>('DATABASE_URL'),
          dbName: configService.getOrThrow<string>('DATABASE_NAME')
        } as MongooseModuleOptions;
      }
    }),
    AdminModule.createAdminAsync({
      inject: [ConfigService],
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          adminJsOptions: options,
          auth: {
            provider,
            cookiePassword: configService.getOrThrow<string>("COOKIE_SECRET"),
            cookieName: 'adminjs',
          },
          sessionOptions: {
            resave: true,
            saveUninitialized: true,
            secret: configService.getOrThrow<string>("COOKIE_SECRET"),
          },
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
