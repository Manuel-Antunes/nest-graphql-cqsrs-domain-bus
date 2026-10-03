import './telemetry';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AgentCoreAgUiServer } from '@nestposts/ai/ag-ui/agentcore/agentcore-ag-ui.server';
import { Logger as PinoLogger } from 'nestjs-pino';

import { TheoAgent } from './agent/theo.agent';
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
  const { port, host } = app.get<AppConfig>(appConfig.KEY);
  await new AgentCoreAgUiServer(app, { agent: TheoAgent }).listen(port, host);
}

void bootstrap();
