import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { inboundTransport } from './infrastructure/transport/inboundTransport';
import {
  inboundDestination,
  transportMode,
} from './infrastructure/transport/transport.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bodyParser: false, bufferLogs: true },
  );
  app.useLogger(app.get(PinoLogger));

  app.connectMicroservice(inboundTransport(app.getHttpAdapter()), {
    inheritAppConfig: true,
  });
  await app.startAllMicroservices();

  const port = Number(process.env.NOTIFICATOR_PORT ?? process.env.PORT ?? 3002);
  await app.listen(port, '0.0.0.0');
  new Logger('bootstrap').log(
    `notificator is listening on ${inboundDestination()} (${transportMode()}), ` +
      `the notifications subgraph at http://localhost:${port}/graphql`,
  );
}

void bootstrap();
