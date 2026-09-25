import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AsyncMicroserviceOptions } from '@nestjs/microservices';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { INNGEST_DEFAULT_SERVE_PATH } from '@nestposts/microservices-inngest';
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

  if (appConfig().transport === 'inngest') {
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      { bufferLogs: true },
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
    logger.log(
      `tagging is listening on ${InboundTransport.destination(config, app.get<AwsConfig>(awsConfig.KEY))} (inngest), served at ` +
        `http://localhost:${config.port}${INNGEST_DEFAULT_SERVE_PATH}`,
    );
    return;
  }

  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(
    AppModule,
    {
      inject: InboundTransport.inject,
      useFactory: InboundTransport.options,
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(PinoLogger));

  await app.listen();
  const config = app.get<AppConfig>(appConfig.KEY);
  logger.log(
    `tagging is listening on ${InboundTransport.destination(config, app.get<AwsConfig>(awsConfig.KEY))} (${config.transport})`,
  );
}

void bootstrap();
