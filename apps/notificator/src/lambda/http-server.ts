import '../telemetry';

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { bootOnce } from '@nestposts/lambda';
import type { FastifyInstance } from 'fastify';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from '../app.module';

export interface NotificationsSubgraph {
  readonly app: NestFastifyApplication;
  readonly instance: FastifyInstance;
}

export const booted = bootOnce<NotificationsSubgraph>(async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bodyParser: false, bufferLogs: true },
  );
  app.useLogger(app.get(PinoLogger));
  await app.init();

  const instance = app.getHttpAdapter().getInstance();
  await instance.ready();

  return { app, instance };
});
