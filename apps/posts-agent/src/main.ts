import './telemetry';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AgentCoreA2aServer } from '@nestposts/ai/a2a/agentcore/agentcore-a2a.server';
import { Logger as PinoLogger } from 'nestjs-pino';

import { PostsManagerAgent } from './agent/posts-manager.agent';
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
  const { port, host, url } = app.get<AppConfig>(appConfig.KEY);
  await new AgentCoreA2aServer(app, { agent: PostsManagerAgent, url }).listen(
    port,
    host,
  );
}

void bootstrap();
