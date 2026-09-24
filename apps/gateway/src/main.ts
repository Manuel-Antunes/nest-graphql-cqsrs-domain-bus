import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { gatewayPort, gatewaySubgraphs } from './gateway.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  await app.listen(gatewayPort(), '0.0.0.0');
  new Logger('bootstrap').log(
    `gateway at http://localhost:${gatewayPort()}/graphql, federating ${gatewaySubgraphs()
      .map(({ name, url }) => `${name} (${url})`)
      .join(', ')}`,
  );
}

void bootstrap();
