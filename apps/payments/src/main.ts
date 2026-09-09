import { PAYMENTS_QUEUE } from '@app/order';
import { rabbitUrl, redisHost, redisPort } from '@app/messaging';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PaymentsModule } from './payments.module';

/**
 * O serviço de pagamentos: sem HTTP, duas portas de entrada.
 *
 * A principal é a fila `order.payments`, por onde chegam os commands da coreografia. A outra é o
 * Redis, por onde chegam as **notificações** dos outros serviços — ele precisa delas para as
 * projeções e subscriptions que venha a ter, e não para reagir: reagir é papel do dono do fato.
 *
 * Ele sobe como aplicação (`create` + `connectMicroservice`), e não como `createMicroservice`,
 * justamente porque são dois transportes. Sem servidor HTTP: `app.init()` no lugar de `listen`.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(PaymentsModule, { logger: ['log', 'warn', 'error'] });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: { urls: [rabbitUrl()], queue: PAYMENTS_QUEUE, queueOptions: { durable: false } },
  });
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: { host: redisHost(), port: redisPort() },
  });

  await app.startAllMicroservices();
  await app.init();
}

void bootstrap();
