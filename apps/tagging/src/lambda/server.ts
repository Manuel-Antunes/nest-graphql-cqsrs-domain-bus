import '../telemetry';

import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AsyncMicroserviceOptions } from '@nestjs/microservices';
import { bootOnce } from '@nestposts/lambda';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from '../app.module';
import { awsConfig } from '../config/aws.config';
import { InboundTransport } from '../infrastructure/transport/inbound-transport';

export const booted = bootOnce<INestMicroservice>(async () => {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(
    AppModule,
    {
      inject: [awsConfig.KEY],
      useFactory: InboundTransport.lambda,
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(PinoLogger));
  await app.listen();
  return app;
});
