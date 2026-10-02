import './telemetry';

import { NestFactory } from '@nestjs/core';
import { AgentCoreA2aServer } from '@nestposts/ai/a2a/agentcore/agentcore-a2a.server';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  await app.get(AgentCoreA2aServer).listen();
}

void bootstrap();
