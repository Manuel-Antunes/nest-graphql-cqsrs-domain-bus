import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { postCompletedTransport, transportMode } from './infrastructure/transport/transport.config';

/**
 * A hybrid application: GraphQL over HTTP and WebSocket, and a RabbitMQ microservice listening on the
 * same process — the two ways into this service, sharing one container.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.connectMicroservice(postCompletedTransport(), { inheritAppConfig: true });
  await app.startAllMicroservices();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('bootstrap').log(
    `GraphQL em http://localhost:${port}/graphql (GraphiQL no mesmo endereço, via browser); ` +
      `mensageria em ${transportMode()}`,
  );
}

void bootstrap();
