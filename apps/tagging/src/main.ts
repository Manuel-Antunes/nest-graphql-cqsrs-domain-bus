import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import {
  inboundDestination,
  inboundTransport,
  transportMode,
} from './infrastructure/transport/transport.config';

/**
 * A microservice and nothing else: no HTTP port, because nobody queries this service. What starts it
 * is a message and what it produces is a message.
 */
async function bootstrap() {
  const logger = new Logger('bootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    ...inboundTransport(),
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  await app.listen();
  logger.log(`tagging is listening on ${inboundDestination()} (${transportMode()})`);
}

void bootstrap();
