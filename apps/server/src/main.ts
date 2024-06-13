import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import 'reflect-metadata';
import { AppModule } from './app.module';

const logger = new Logger('ROOT');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService>(ConfigService);
  app.enableCors({
    allowedHeaders:'*',
    origin: '*'
  });
  (app as NestExpressApplication).set('trust proxy', true);
  const port = configService.get<number>('SERVER_PORT', 3000);
  await app.listen(port, () => {
    logger.verbose(`Server started on ${port}`);
  });
}
bootstrap();
