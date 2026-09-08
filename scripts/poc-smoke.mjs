#!/usr/bin/env node
/**
 * Smoke test da POC contra uma app já no ar: abre subscriptions GraphQL via graphql-ws, dispara
 * mutations e queries, e confere as contagens no fim. Rodado pelo `scripts/poc-smoke.sh`, que
 * builda e sobe a app antes; também dá para rodar solto: `node scripts/poc-smoke.mjs` (porta 3000).
 */
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';

const PORT = process.env.PORT ?? '3000';
const URL = `http://localhost:${PORT}/graphql`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const step = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

const gql = async (query, variables) => {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
};

const ws = createClient({ url: URL.replace('http', 'ws'), webSocketImpl: WebSocket });
const subscribe = (query, variables) => {
  const received = [];
  ws.subscribe({ query, variables }, { next: (r) => received.push(r.data), error: (e) => console.error('subscription error', e), complete: () => {} });
  return received;
};

const POST = 'id title content author version tags(first: 5) { edges { cursor node { id name } } pageInfo { hasNextPage } totalCount }';
const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  step(`${ok ? 'ok ' : 'FAIL'} ${label} -> ${JSON.stringify(actual)} (esperado ${JSON.stringify(expected)})`);
  if (!ok) failures.push(label);
};

// ---- 1. subscriptions globais -------------------------------------------------------------
const created = subscribe(`subscription { onPostCreated { ${POST} } }`);
const updatedAll = subscribe(`subscription { onPostUpdated { ${POST} } }`);
await sleep(300);
step('subscriptions abertas: onPostCreated, onPostUpdated(sem filtro)');

// ---- 2. commands: createPost A e B ----------------------------------------------------------
const a = (await gql(`mutation { createPost(input:{title:"Nest + GraphQL", content:"primeiro post", author:"manuel"}) { ${POST} } }`)).data.createPost;
const b = (await gql(`mutation { createPost(input:{title:"Segundo post", content:"outro conteúdo", author:"manuel"}) { ${POST} } }`)).data.createPost;
step(`criados A=${a.id} B=${b.id}`);
await sleep(300); // a saga da tag padrão é assíncrona

// subscription filtrada por tópico (postId = A), aberta depois das criações
const updatedA = subscribe(`subscription($postId: ID) { onPostUpdated(postId: $postId) { ${POST} } }`, { postId: a.id });
await sleep(300);
step('subscription aberta: onPostUpdated(postId: A)');

// ---- 3. commands: updatePost ----------------------------------------------------------------
await gql(`mutation { updatePost(input:{id:"${a.id}", title:"A — título editado"}) { id } }`);
await gql(`mutation { updatePost(input:{id:"${b.id}", content:"B — conteúdo editado"}) { id } }`);
await gql(`mutation { updatePost(input:{id:"${a.id}", content:"A — conteúdo editado"}) { id } }`);
step('updates disparados (A título, B conteúdo, A conteúdo)');

// ---- 4. erros esperados ---------------------------------------------------------------------
const code = async (query) => (await gql(query)).errors?.[0]?.extensions?.code;
check('updatePost inexistente', await code(`mutation { updatePost(input:{id:"00000000-0000-0000-0000-000000000000", title:"x"}) { id } }`), 'NOT_FOUND');
check('updatePost id malformado', await code(`mutation { updatePost(input:{id:"nao-existe", title:"x"}) { id } }`), 'BAD_USER_INPUT');
check('updatePost sem mudanças', await code(`mutation { updatePost(input:{id:"${a.id}"}) { id } }`), 'BAD_USER_INPUT');
check('createPost title em branco', await code(`mutation { createPost(input:{title:"   ", content:"c", author:"a"}) { id } }`), 'BAD_USER_INPUT');
check('createPost title longo', await code(`mutation { createPost(input:{title:"${'x'.repeat(201)}", content:"c", author:"a"}) { id } }`), 'BAD_USER_INPUT');

// ---- 5. queries -----------------------------------------------------------------------------
const postA = (await gql(`{ post(id:"${a.id}") { ${POST} } }`)).data.post;
check('post(A).version (1 criação + tag + 2 updates)', postA.version, 4);
check('post(A).tags', postA.tags.edges.map((e) => e.node.name), ['Untagged']);
check('post(inexistente)', (await gql(`{ post(id:"00000000-0000-0000-0000-000000000000") { id } }`)).data.post, null);
const page1 = (await gql(`{ posts(first:1) { edges { cursor node { id } } pageInfo { hasNextPage endCursor } totalCount } }`)).data.posts;
const page2 = (await gql(`query($after: String) { posts(first:1, after:$after) { edges { node { id } } pageInfo { hasNextPage } } }`, { after: page1.pageInfo.endCursor })).data.posts;
check('cursor connection: página 1 = A, hasNext', [page1.edges[0].node.id === a.id, page1.pageInfo.hasNextPage], [true, true]);
check('cursor connection: página 2 = B, sem next', [page2.edges[0].node.id === b.id, page2.pageInfo.hasNextPage], [true, false]);

// ---- 6. resumo das subscriptions ------------------------------------------------------------
await sleep(500);
check('onPostCreated', created.length, 2);
check('onPostUpdated (todos): 2 tags padrão + 3 updates', updatedAll.length, 5);
check('onPostUpdated (só A): aberta depois das criações, só os 2 updates de A', updatedA.map((d) => d.onPostUpdated.title), ['A — título editado', 'A — título editado']);

await ws.dispose();
step(failures.length ? `FALHOU: ${failures.join(', ')}` : 'DONE — tudo bateu');
process.exit(failures.length ? 1 : 0);
