import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { default as MongoStore } from 'connect-mongo';
import { default as session } from 'express-session';
import 'reflect-metadata';
import { AppModule } from './app.module';

const logger = new Logger('ROOT');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    allowedHeaders: "*",
    origin: "*"
  });
  (app as NestExpressApplication).set('trust proxy', true);
  const configService = app.get<ConfigService>(ConfigService);
  app.use(
    session({
      secret: configService.get<string>('SESSION_KEY'),
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: configService.getOrThrow<string>('DB_URI'),
        dbName: configService.getOrThrow<string>('DB_NAME'),
        autoRemove: 'native'
      })
    })
  );
  const port = configService.get<number>('SERVER_PORT', 3000);
  await app.listen(port, () => {
    logger.verbose(`Server started on ${port}`);
  });
}
bootstrap();
