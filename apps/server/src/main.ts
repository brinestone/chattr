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
  let allowedOrigin = '*';
  console.log(configService.get<string>('NODE_ENV'));
  console.log(configService.get<string>('ALLOWED_ORIGIN'));
  if (configService.get<string>('NODE_ENV') == 'development') {
    allowedOrigin = configService.get<string>('ALLOWED_ORIGIN') ?? allowedOrigin;
  }
  console.log(allowedOrigin);

  app.enableCors({
    allowedHeaders: ['content-type', '*'],
    credentials: true,
    origin: allowedOrigin
  });
  (app as NestExpressApplication).set('trust proxy', true);
  const port = configService.get<number>('SERVER_PORT', 3000);
  await app.listen(port, () => {
    logger.verbose(`Server started on ${port}`);
  });
}
bootstrap();
