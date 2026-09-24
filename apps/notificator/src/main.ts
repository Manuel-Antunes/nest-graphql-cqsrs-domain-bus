import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { inboundTransport } from './infrastructure/transport/inboundTransport';
import {
  inboundDestination,
  transportMode,
} from './infrastructure/transport/transport.config';

const INNGEST_SERVE_PATH = '/api/inngest';

async function bootstrap() {
  const logger = new Logger('bootstrap');

  if (transportMode() === 'inngest') {
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      {
        bufferLogs: true,
      },
    );
    app.useLogger(app.get(PinoLogger));

    app.connectMicroservice(inboundTransport(app.getHttpAdapter()), {
      inheritAppConfig: true,
    });
    await app.startAllMicroservices();

    const port = Number(
      process.env.NOTIFICATOR_PORT ?? process.env.PORT ?? 3002,
    );
    await app.listen(port, '0.0.0.0');
    logger.log(
      `notificator is listening on ${inboundDestination()} (inngest), served at ` +
        `http://localhost:${port}${INNGEST_SERVE_PATH}`,
    );
    return;
  }

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      ...inboundTransport(),
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(PinoLogger));

  await app.listen();
  logger.log(
    `notificator is listening on ${inboundDestination()} (${transportMode()})`,
  );
}

void bootstrap();
