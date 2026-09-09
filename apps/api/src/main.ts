import { API_QUEUE } from '@app/order';
import { rabbitUrl, redisHost, redisPort } from '@app/messaging';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

/**
 * A API sobe **híbrida**, com três portas de entrada na mesma aplicação:
 *
 * - **HTTP** — o GraphQL, incluindo as subscriptions por WebSocket;
 * - **Redis** — as notificações de domínio dos outros serviços (difusão);
 * - **RabbitMQ** (`order.api`) — os commands que a coreografia manda para cá **e** os eventos
 *   duráveis, que precisam de fila e ack.
 *
 * Os três entram no mesmo container: um `CommandBus`, um `RemoteEventBus`, um livro-caixa. Que uma
 * mensagem tenha chegado por HTTP, por pub/sub ou por fila é assunto da borda; da porta para dentro
 * é tudo aplicação.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>(
    { transport: Transport.REDIS, options: { host: redisHost(), port: redisPort() } },
    { inheritAppConfig: true },
  );
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: { urls: [rabbitUrl()], queue: API_QUEUE, queueOptions: { durable: false } },
    },
    { inheritAppConfig: true },
  );
  await app.startAllMicroservices();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('bootstrap').log(`GraphQL em http://localhost:${port}/graphql · Redis e a fila ${API_QUEUE} escutando`);
}

void bootstrap();
