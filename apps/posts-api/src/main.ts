import './telemetry';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { postCompletedTransport, transportMode } from './infrastructure/transport/transport.config';

/**
 * A hybrid application: GraphQL over HTTP and WebSocket, and a microservice listening on the same
 * process — the two ways into this service, sharing one container.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bodyParser: false, bufferLogs: true },
  );
  app.useLogger(app.get(PinoLogger));

  app.connectMicroservice(postCompletedTransport(app.getHttpAdapter()), { inheritAppConfig: true });
  await app.startAllMicroservices();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('bootstrap').log(
    `GraphQL em http://localhost:${port}/graphql (GraphiQL no mesmo endereço, via browser); ` +
      `mensageria em ${transportMode()}`,
  );
}

void bootstrap();
