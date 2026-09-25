import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(appConfig.KEY);
  await app.listen(config.port, '0.0.0.0');
  new Logger('bootstrap').log(
    `gateway at http://localhost:${config.port}/graphql, federating ${config.subgraphs
      .map(({ name, url }) => `${name} (${url})`)
      .join(', ')}`,
  );
}

void bootstrap();
