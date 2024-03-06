import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  (app as NestExpressApplication).set('trust proxy', true);
  await app.listen(3000);
}
bootstrap();
