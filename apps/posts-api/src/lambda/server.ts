import '../telemetry';

import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { bootOnce } from '@nestposts/lambda';
import type { FastifyInstance } from 'fastify';
import { AppModule } from '../app.module';
import { lambdaTransport } from '../infrastructure/transport/transport.config';

export interface PostsApi {
  readonly app: NestFastifyApplication;
  readonly instance: FastifyInstance;
  readonly consumer: INestMicroservice;
}

export const booted = bootOnce<PostsApi>(async () => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  const consumer = app.connectMicroservice<MicroserviceOptions>(lambdaTransport(), {
    inheritAppConfig: true,
  });
  await app.startAllMicroservices();
  await app.init();

  const instance = app.getHttpAdapter().getInstance();
  await instance.ready();

  return { app, instance, consumer };
});
