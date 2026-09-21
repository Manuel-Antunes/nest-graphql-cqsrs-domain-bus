import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { INBOUND_QUEUE, inboundTransport, transportMode } from './infrastructure/transport/transport.config';

/**
 * A microservice and nothing else: no HTTP port, because nobody queries this service. What starts it
 * is a message and what it produces is a message.
 */
async function bootstrap() {
  const logger = new Logger('bootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, inboundTransport());

  await app.listen();
  logger.log(`tagging is listening on ${INBOUND_QUEUE} (${transportMode()})`);
}

void bootstrap();
