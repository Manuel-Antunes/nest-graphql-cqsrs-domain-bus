import './telemetry';

import type { MicroserviceOptions } from '@nestjs/microservices';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { inboundTransport } from './infrastructure/transport/inboundTransport';
import {
  inboundDestination,
  transportMode,
} from './infrastructure/transport/transport.config';

const INNGEST_SERVE_PATH = '/api/inngest';

/**
 * A microservice and nothing else: no HTTP port, because nobody queries this service. What starts it
 * is a message and what it produces is a message.
 *
 * **Unless the transport is Inngest**, which reaches a service by CALLING it. Then this is a hybrid:
 * an HTTP server whose only route is `/api/inngest`, with the microservice mounted onto it. That is
 * the one thing this transport costs that a broker does not, and it is why the port exists only in
 * that mode rather than always.
 */
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

    const port = Number(process.env.TAGGING_PORT ?? process.env.PORT ?? 3001);
    await app.listen(port, '0.0.0.0');
    logger.log(
      `tagging is listening on ${inboundDestination()} (inngest), served at ` +
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
    `tagging is listening on ${inboundDestination()} (${transportMode()})`,
  );
}

void bootstrap();
