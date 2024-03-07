import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import * as fbCreds from './assets/firebase-credentials.json';
import { ServiceAccount, cert, initializeApp } from 'firebase-admin/app';

const logger = new Logger('ROOT');
logger.verbose('Initializing Firebase...');

initializeApp({
  credential: cert(fbCreds as ServiceAccount),
  databaseURL: 'https://chattr-8d770-default-rtdb.firebaseio.com/',
  databaseAuthVariableOverride: {
    uid: 'backend_api',
  },
});

logger.verbose('Firebase initialized successfully');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  (app as NestExpressApplication).set('trust proxy', true);
  await app.listen(3000);
}
bootstrap();
