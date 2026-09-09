import {
  API_QUEUE,
  OrderStep,
  newOrderKey,
  PAYMENTS_QUEUE,
} from '@app/order';
import { EnqueueCommand, rabbitUrl, redisHost, redisPort } from '@app/messaging';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { AppModule } from '../apps/api/src/app.module';
import { PaymentsModule } from '../apps/payments/src/payments.module';
import { PaymentLedger } from '../apps/api/src/ledger/payment-ledger';
import { GraphqlClient, until } from '../apps/api/test/support/graphql-client';

/**
 * O fluxo do pedido inteiro, com os **dois serviços de verdade** subindo no mesmo processo (mas em
 * containers de DI separados, como em máquinas separadas) e os **dois brokers de verdade** — o Redis
 * e o RabbitMQ do `docker-compose.yml`. Nada aqui é mock: o que atravessa é JSON num socket.
 *
 * O que o teste prova, na ordem de importância:
 *
 * 1. **a coreografia acontece** — quatro passos, dois em cada serviço, sem orquestrador;
 * 2. **a subscription vê os quatro**, inclusive os dois que rodaram no outro processo, e é a chave do
 *    cliente que os junta;
 * 3. **a saga compartilhada não duplica** — a mesma classe está registrada nos dois serviços, e ainda
 *    assim cada passo é enfileirado uma vez só;
 * 4. **a chave deduplica** o pedido, e permite assinar *antes* de começar.
 */
describe('order (e2e, dois serviços + Redis + RabbitMQ)', () => {
  let api: INestApplication;
  let payments: INestApplication;
  let ledger: PaymentLedger;
  let client: GraphqlClient;
  /** Todo `EnqueueCommand` que passou pelo `CommandBus` de cada serviço — a prova da não-duplicação. */
  const enqueued: { api: EnqueueCommand[]; payments: EnqueueCommand[] } = { api: [], payments: [] };

  const UPDATE_FIELDS = 'key orderId step detail occurredAt';
  const placeOrder = (input: { key: string; amount: number; customer?: string; orderId?: string }) =>
    client.execute(
      `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { key orderId amount customer status reason payment { status } } }`,
      { input: { customer: 'manuel', ...input } },
    );
  const order = (key: string) =>
    client.execute(
      `query($key: ID!) { order(key: $key) { key status reason amount payment { status amount authorizationId receiptId reason } } }`,
      { key },
    );

  /** Assina `onOrderUpdated(key)` e espera o assinante estar registrado no bus da API. */
  const watch = async (key: string) => {
    const bus = api.get(CommandBus); // só para garantir que a app está de pé
    expect(bus).toBeDefined();
    const collector = client.subscribe<{ onOrderUpdated: { key: string; step: OrderStep; detail: string | null; occurredAt: string } }>(
      `subscription($key: ID!) { onOrderUpdated(key: $key) { ${UPDATE_FIELDS} } }`,
      { key },
    );
    // o graphql-ws confirma a inscrição de forma assíncrona; um respiro evita a corrida com a mutation
    await new Promise((resolve) => setTimeout(resolve, 250));
    return collector;
  };
  const steps = (received: { onOrderUpdated: { step: OrderStep } }[]) => received.map((r) => r.onOrderUpdated.step);
  /**
   * A ordem **causal**, que é a que o sistema garante: cada evento carrega o instante em que o fato
   * aconteceu, e um fato causado por outro tem `occurredAt` posterior.
   *
   * A ordem de *entrega* é outra coisa. Os passos chegam ao assinante por dois caminhos diferentes —
   * os do serviço de pagamentos por Redis, os daqui pelo `EventBus` local, depois de uma ida e volta
   * pelo RabbitMQ. Dois transportes independentes não têm ordem entre si, então `DECLINED` e
   * `FAILED` (publicados quase no mesmo instante, um em cada serviço) podem chegar trocados. É uma
   * propriedade do desenho, não um defeito: a fila é o que garante que o trabalho aconteça **uma
   * vez**, e o preço é não haver relógio comum entre ela e o pub/sub. Um cliente que precise exibir
   * a linha do tempo ordena por `occurredAt` — que é para isso que ele está no payload.
   */
  const causalSteps = (received: { onOrderUpdated: { step: OrderStep; occurredAt: string } }[]) =>
    [...received].sort((a, b) => a.onOrderUpdated.occurredAt.localeCompare(b.onOrderUpdated.occurredAt)).map((r) => r.onOrderUpdated.step);

  beforeAll(async () => {
    // os dois serviços sobem com os DOIS transportes, como em produção: a fila para o trabalho,
    // o Redis para as notificações
    const paymentsModule = await Test.createTestingModule({ imports: [PaymentsModule] }).compile();
    payments = paymentsModule.createNestApplication();
    payments.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: { urls: [rabbitUrl()], queue: PAYMENTS_QUEUE, queueOptions: { durable: false } },
    });
    payments.connectMicroservice<MicroserviceOptions>({
      transport: Transport.REDIS,
      options: { host: redisHost(), port: redisPort() },
    });
    await payments.startAllMicroservices();
    await payments.init();

    const apiModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    api = apiModule.createNestApplication();
    api.connectMicroservice<MicroserviceOptions>({
      transport: Transport.REDIS,
      options: { host: redisHost(), port: redisPort() },
    });
    api.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: { urls: [rabbitUrl()], queue: API_QUEUE, queueOptions: { durable: false } },
    });
    await api.startAllMicroservices();
    await api.listen(0, '127.0.0.1');
    client = await GraphqlClient.for(api);
    ledger = api.get(PaymentLedger);

    api.get(CommandBus).subscribe((command) => command instanceof EnqueueCommand && enqueued.api.push(command));
    payments.get(CommandBus).subscribe((command) => command instanceof EnqueueCommand && enqueued.payments.push(command));
  });

  afterAll(async () => {
    await client?.dispose();
    await api?.close();
    await payments?.close();
  });

  it('walks the whole choreography and streams all four steps to the subscriber that holds the key', async () => {
    const key = newOrderKey();
    const updates = await watch(key);

    const { data, errors } = await placeOrder({ key, amount: 4990 });

    expect(errors).toBeUndefined();
    expect(data!.placeOrder).toMatchObject({ key, amount: 4990, customer: 'manuel', status: 'PENDING' });

    const received = await updates.waitFor(4, 20000);
    expect(causalSteps(received)).toEqual([
      OrderStep.PLACED, //      API         (local)
      OrderStep.AUTHORIZED, //  pagamentos  (chegou por Redis)
      OrderStep.CAPTURED, //    pagamentos  (chegou por Redis)
      OrderStep.COMPLETED, //   API         (local)
    ]);
    expect(steps(received)[0]).toBe(OrderStep.PLACED); // o primeiro passo é sempre daqui
    received.forEach((update) => expect(update.onOrderUpdated.key).toBe(key));

    const { data: finished } = await order(key);
    expect(finished!.order).toMatchObject({ status: 'COMPLETED' });
    // o pagamento é um agregado do OUTRO serviço: a API só o conhece pelos eventos que chegaram
    // por Redis, projetados no read model que responde por `Order.payment`
    expect(finished!.order.payment).toMatchObject({ status: 'CAPTURED', amount: 4990, reason: null });
    expect(finished!.order.payment.authorizationId).toEqual(expect.any(String));
    expect(finished!.order.payment.receiptId).toEqual(expect.any(String));
    updates.unsubscribe();
  });

  it('runs each saga rule exactly once, in the service that owns the fact — the same saga is registered in both', async () => {
    const key = newOrderKey();
    const updates = await watch(key);
    const before = { api: enqueued.api.length, payments: enqueued.payments.length };

    await placeOrder({ key, amount: 1500 });
    await updates.waitFor(4, 20000);
    await new Promise((resolve) => setTimeout(resolve, 500)); // deixa qualquer duplicata chegar

    const fromApi = enqueued.api.slice(before.api).map((command) => command.pattern);
    const fromPayments = enqueued.payments.slice(before.payments).map((command) => command.pattern);

    // a API só reage ao que aconteceu NELA (OrderStarted); o resto chegou pelo RemoteEventBus,
    // que a saga não escuta — por isso não há um segundo payment.capture aqui
    expect(fromApi).toEqual(['payment.authorize']);
    expect(fromPayments).toEqual(['payment.capture', 'order.complete']);
    updates.unsubscribe();
  });

  it('is idempotent on the key: the same order twice is one order and one set of events', async () => {
    const key = newOrderKey();
    const updates = await watch(key);

    const first = await placeOrder({ key, amount: 2500 });
    const second = await placeOrder({ key, amount: 999999 }); // valor diferente: deve ser ignorado

    expect(second.errors).toBeUndefined();
    expect(second.data!.placeOrder).toMatchObject({ key, amount: 2500, orderId: first.data!.placeOrder.orderId });

    const received = await updates.waitFor(4, 20000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(causalSteps(received)).toEqual([
      OrderStep.PLACED,
      OrderStep.AUTHORIZED,
      OrderStep.CAPTURED,
      OrderStep.COMPLETED,
    ]);
    expect(updates.received).toHaveLength(4); // e não oito
    updates.unsubscribe();
  });

  it('takes the sad path when the acquirer declines, and says why', async () => {
    const key = newOrderKey();
    const updates = await watch(key);

    await placeOrder({ key, amount: 250_000 });

    const received = await updates.waitFor(3, 20000);
    expect(causalSteps(received)).toEqual([OrderStep.PLACED, OrderStep.DECLINED, OrderStep.FAILED]);
    expect(received.map((update) => update.onOrderUpdated.detail).join(' ')).toMatch(/limite de autorização/);

    const { data } = await order(key);
    expect(data!.order).toMatchObject({ status: 'FAILED' });
    expect(data!.order.reason).toMatch(/limite de autorização/);
    expect(data!.order.payment).toMatchObject({ status: 'DECLINED', amount: 250_000, receiptId: null });
    expect(data!.order.payment.reason).toMatch(/limite de autorização/);
    updates.unsubscribe();
  });

  it('lets two clients watch the same order — the key is also the stream they share', async () => {
    const key = newOrderKey();
    const first = await watch(key);
    const second = await watch(key);

    await placeOrder({ key, amount: 700 });

    expect(causalSteps(await first.waitFor(4, 20000))).toEqual(causalSteps(await second.waitFor(4, 20000)));
    first.unsubscribe();
    second.unsubscribe();
  });

  it('sends the captured payment down two transports: broadcast for the client, a queue for the ledger', async () => {
    const key = newOrderKey();
    const updates = await watch(key);
    const before = ledger.total;

    await placeOrder({ key, amount: 8800 });
    await updates.waitFor(4, 20000);
    await until(() => ledger.find(key) !== undefined, 10000);

    // o mesmo PaymentCapturedEvent: chegou por difusão (é o CAPTURED que o assinante viu)…
    const captured = (await updates.waitFor(4, 20000)).find((u) => u.onOrderUpdated.step === OrderStep.CAPTURED)!;
    // …e por fila, com ack, no consumidor que não pode perder nenhum
    const entry = ledger.find(key)!;
    expect(entry).toMatchObject({ orderKey: key, amount: 8800 });
    expect(entry.receiptId).toBe(captured.onOrderUpdated.detail);
    expect(ledger.total).toBe(before + 8800);
    updates.unsubscribe();
  });

  it('records each capture in the ledger exactly once, even though a queue delivers at least once', async () => {
    const key = newOrderKey();
    const updates = await watch(key);
    const before = ledger.entries.length;

    await placeOrder({ key, amount: 1200 });
    await updates.waitFor(4, 20000);
    await until(() => ledger.find(key) !== undefined, 10000);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(ledger.entries.length).toBe(before + 1);
    updates.unsubscribe();
  });

  it('keeps a declined payment out of the ledger — nothing was captured', async () => {
    const key = newOrderKey();
    const updates = await watch(key);

    await placeOrder({ key, amount: 300_000 });
    await updates.waitFor(3, 20000);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(ledger.find(key)).toBeUndefined();
    updates.unsubscribe();
  });

  it('has no payment until the acquirer answers — null is the real state, not a missing field', async () => {
    const key = newOrderKey();
    const updates = await watch(key);

    // a resposta da PRÓPRIA mutation: o pedido acabou de nascer e o adquirente nem foi consultado.
    // É o único instante em que "ainda não há pagamento" é determinístico — uma consulta depois já
    // corre contra a coreografia, que leva poucos milissegundos.
    const { data } = await placeOrder({ key, amount: 3300 });
    expect(data!.placeOrder).toMatchObject({ status: 'PENDING', payment: null });

    await updates.waitFor(4, 20000);
    const { data: paid } = await order(key);
    expect(paid!.order.payment).toMatchObject({ status: 'CAPTURED', amount: 3300 });
    updates.unsubscribe();
  });

  it('rejects a malformed key before anything is enqueued', async () => {
    const { data, errors } = await placeOrder({ key: 'nao-e-uuid', amount: 100 });

    expect(data).toBeNull();
    expect(errors?.[0].extensions).toEqual({ code: 'BAD_USER_INPUT' });
  });
});
