// Fluxo do pedido contra os DOIS serviços rodando de verdade: assina antes, dispara depois,
// e confere que os quatro passos chegam — dois deles vindos do serviço de pagamentos, por Redis.
import { createClient } from 'graphql-ws';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const PORT = process.env.PORT ?? '9099';
const HTTP = `http://127.0.0.1:${PORT}/graphql`;
const ws = createClient({ url: `ws://127.0.0.1:${PORT}/graphql`, webSocketImpl: WebSocket, lazy: false });

const execute = async (query, variables) =>
  (await fetch(HTTP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();

const watch = (key) => {
  const received = [];
  const unsubscribe = ws.subscribe(
    { query: `subscription($key: ID!) { onOrderUpdated(key: $key) { step detail occurredAt } }`, variables: { key } },
    { next: (r) => received.push(r.data.onOrderUpdated), error: (e) => console.error('sub error', e), complete: () => {} },
  );
  return { received, unsubscribe };
};
const waitFor = async (collector, n, ms = 15000) => {
  const deadline = Date.now() + ms;
  while (collector.received.length < n) {
    if (Date.now() > deadline) throw new Error(`esperava ${n}, recebi ${collector.received.length}: ${JSON.stringify(collector.received)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return collector.received;
};
// A ordem CAUSAL: os passos vêm por dois transportes (Redis e RabbitMQ), que não têm ordem entre si.
// Quem precisa da linha do tempo ordena por occurredAt — que é para isso que ele está no payload.
const causal = (received) => [...received].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((u) => u.step);
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'ok  ' : 'FALHOU '} ${label} -> ${JSON.stringify(actual)}${ok ? '' : ` (esperado ${JSON.stringify(expected)})`}`);
  if (!ok) process.exitCode = 1;
};

const START = `mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { key status amount } }`;

// caminho feliz — o cliente assina ANTES de existir pedido, com a chave que ele mesmo gerou
const happy = randomUUID();
const happyWatch = watch(happy);
await new Promise((r) => setTimeout(r, 300));
const started = await execute(START, { input: { key: happy, amount: 4990, customer: 'manuel' } });
check('placeOrder devolve PENDING', started.data.placeOrder.status, 'PENDING');
check('os 4 passos, 2 deles do outro serviço', causal(await waitFor(happyWatch, 4)), ['PLACED', 'AUTHORIZED', 'CAPTURED', 'COMPLETED']);
const finished = await execute(`query($key: ID!) { order(key: $key) { status payment { status amount } } }`, { key: happy });
check('o pedido terminou COMPLETED', finished.data.order.status, 'COMPLETED');
check('e o Order.payment veio dos eventos do outro serviço', finished.data.order.payment, { status: 'CAPTURED', amount: 4990 });
happyWatch.unsubscribe();

// idempotência: a mesma chave duas vezes é um pedido só
const dup = randomUUID();
const dupWatch = watch(dup);
await new Promise((r) => setTimeout(r, 300));
await execute(START, { input: { key: dup, amount: 1500, customer: 'manuel' } });
const repeated = await execute(START, { input: { key: dup, amount: 999999, customer: 'outro' } });
check('a segunda chamada devolve o mesmo pedido', repeated.data.placeOrder.amount, 1500);
await waitFor(dupWatch, 4);
await new Promise((r) => setTimeout(r, 800));
check('e o fluxo rodou uma vez só', dupWatch.received.length, 4);
dupWatch.unsubscribe();

// recusa
const sad = randomUUID();
const sadWatch = watch(sad);
await new Promise((r) => setTimeout(r, 300));
await execute(START, { input: { key: sad, amount: 250000, customer: 'manuel' } });
check('caminho de recusa', causal(await waitFor(sadWatch, 3)), ['PLACED', 'DECLINED', 'FAILED']);
sadWatch.unsubscribe();

await ws.dispose();
console.log(process.exitCode ? 'FALHOU' : 'DONE — o fluxo distribuído bateu');
