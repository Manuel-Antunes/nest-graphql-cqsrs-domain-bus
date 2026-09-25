import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AsyncMicroserviceOptions } from '@nestjs/microservices';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { Inngest } from 'inngest';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import type { AwsConfig } from './config/aws.config';
import { awsConfig } from './config/aws.config';
import type { InngestConfig } from './config/inngest.config';
import type { RabbitmqConfig } from './config/rabbitmq.config';
import { InboundTransport } from './infrastructure/transport/inbound-transport';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bodyParser: false, bufferLogs: true },
  );
  app.useLogger(app.get(PinoLogger));

  app.connectMicroservice<AsyncMicroserviceOptions>(
    {
      inject: InboundTransport.inject,
      useFactory: (
        config: AppConfig,
        aws: AwsConfig,
        rabbitmq: RabbitmqConfig,
        inngest: InngestConfig,
        inngestClient: Inngest.Any,
      ) =>
        InboundTransport.options(
          config,
          aws,
          rabbitmq,
          inngest,
          inngestClient,
          app.getHttpAdapter(),
        ),
    },
    { inheritAppConfig: true },
  );
  await app.startAllMicroservices();

  const config = app.get<AppConfig>(appConfig.KEY);
  await app.listen(config.port, '0.0.0.0');
  new Logger('bootstrap').log(
    `notificator is listening on ${InboundTransport.destination(config, app.get<AwsConfig>(awsConfig.KEY))} (${config.transport}), ` +
      `the notifications subgraph at http://localhost:${config.port}/graphql`,
  );
}

void bootstrap();
