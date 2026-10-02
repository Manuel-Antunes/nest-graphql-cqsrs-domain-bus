import './telemetry';

import { NestFactory } from '@nestjs/core';
import { AgentCoreAgUiServer } from '@nestposts/ai/ag-ui/agentcore/agentcore-ag-ui.server';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  await app.get(AgentCoreAgUiServer).listen();
}

void bootstrap();
