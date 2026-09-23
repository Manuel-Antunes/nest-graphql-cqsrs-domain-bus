import '../telemetry';

import type { INestMicroservice } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { NestFactory } from '@nestjs/core';
import { bootOnce } from '@nestposts/lambda';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from '../app.module';
import { lambdaTransport } from '../infrastructure/transport/transport.config';

export const booted = bootOnce<INestMicroservice>(async () => {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      ...lambdaTransport(),
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(PinoLogger));
  await app.listen();
  return app;
});
