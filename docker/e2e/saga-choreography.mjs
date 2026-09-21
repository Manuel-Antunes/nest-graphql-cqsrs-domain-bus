/**
 * O teste da SAGA COREOGRAFADA, ponta a ponta e entre processos.
 *
 * O que ele prova, e por que cada afirmação existe:
 *
 *  1. o createPost responde na VERSÃO 1, sem tag. É a assinatura de que o passo de tagueamento saiu do
 *     fluxo da escrita: se respondesse 2, o trabalho estaria sendo feito em processo e a coreografia
 *     seria decorativa;
 *  2. a subscription onPostCreated recebe o post COMPLETO, versão 2, com a tag. É a volta inteira:
 *     posts-api -> RabbitMQ -> tagging -> RabbitMQ -> posts-api -> WebSocket;
 *  3. o estado durável de CADA serviço tem exatamente o que devia ter — a posts-api tem a linha do
 *     post na versão 2 com o vínculo da tag; o tagging tem os dois eventos no stream dele, e nem um a
 *     mais. É o que prova as duas coisas que mais podiam dar errado: que a ingestão torne o evento
 *     durável do lado de cá (e não só alimente um handler em memória), e que a marca de origem impeça
 *     o laço de reenvio — um laço apareceria aqui como contagem crescendo;
 *  4. o inbox de cada serviço tem uma linha por mensagem recebida, nomeando quem a produziu;
 *  5. reentregar a MESMA mensagem não produz uma segunda decisão. É o teste de idempotência, e ele é
 *     feito pela API de management do RabbitMQ — publicando o envelope na mão, o que também valida o
 *     formato de fio;
 *  6. o canal de RÉPLICA mantém o stream do Post completo no outro serviço;
 *  7. UMA request, UM correlation id — nos dois processos. O que a borda abriu chega ao outro serviço
 *     e volta na mensagem que ELE produz, o que é a diferença entre um rastro e dois.
 */
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';

const API = 'http://localhost:3000';
const RABBIT = `${process.env.RABBITMQ_MANAGEMENT ?? 'http://localhost:15672'}/api`;
const RABBIT_AUTH =
  'Basic ' +
  Buffer.from(`${process.env.RABBITMQ_USER ?? 'guest'}:${process.env.RABBITMQ_PASSWORD ?? 'guest'}`).toString(
    'base64',
  );
const LOGS = process.env.E2E_LOGS ?? '.e2e';
const EXCHANGE = 'nestposts.events';

let pass = 0;
let fail = 0;
const ok = (message, extra) => {
  console.log(`  PASS  ${message}`);
  if (extra) console.log(`        ${extra}`);
  pass++;
};
const bad = (message, detail) => {
  console.log(`  FAIL  ${message}`);
  console.log(`        -> ${detail}`);
  fail++;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Cada serviço guarda o que é dele no próprio arquivo — é o teste lendo o estado durável de fora. */
const read = (database, sql, ...parameters) => {
  const db = new DatabaseSync(`${LOGS}/${database}.db`, { readOnly: true });
  try {
    return db.prepare(sql).all(...parameters);
  } finally {
    db.close();
  }
};

const write = (database, sql, ...parameters) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const db = new DatabaseSync(`${LOGS}/${database}.db`);
    try {
      return db.prepare(sql).run(...parameters);
    } catch (failure) {
      if (!String(failure).includes('locked') && !String(failure).includes('busy')) throw failure;
    } finally {
      db.close();
    }
    execFileSync('sleep', ['0.2']);
  }
  throw new Error(`não consegui escrever em ${database} — o banco ficou travado`);
};

// ------------------------------------------------------------------ o autor

const credentials = { email: `autor+${Date.now()}@example.com`, name: 'manuel', password: 'senha-super-secreta' };

async function signUp() {
  /*
   * O `Origin` não é enfeite: o Better Auth recusa uma escrita sem ele (`MISSING_OR_NULL_ORIGIN`), que
   * é a proteção de CSRF dele. Um cliente de navegador manda o header sozinho; um script tem de dizer
   * de onde está falando, e o valor é o `baseURL` da aplicação.
   */
  const response = await fetch(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: API },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) {
    throw new Error(`sign-up falhou (${response.status}): ${await response.text()}`);
  }
  const cookie = (response.headers.getSetCookie?.() ?? []).map((one) => one.split(';')[0]).join('; ');
  const { user } = await response.json();
  return { cookie, credentialId: user.id };
}

/**
 * O papel de autor, concedido direto na credencial.
 *
 * É a única coisa que este script faz por fora das portas da aplicação, e é deliberado: conceder papel
 * não é operação de produção deste serviço (quem o faz é a porta de identidade, em código), e abrir um
 * endpoint para isso seria superfície de produção existindo por causa de um teste. O perfil de domínio
 * é promovido pela própria aplicação na requisição seguinte.
 */
function promoteToAuthor(credentialId) {
  write('posts', 'update auth_user set role = ? where id = ?', 'author', credentialId);
}

async function gql(query, cookie, variables) {
  const response = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: API, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

/** A subscription pelo mesmo graphql-ws que um cliente de verdade usa. */
function subscribe(query, cookie) {
  const events = [];
  const client = createClient({
    url: `${API.replace('http', 'ws')}/graphql`,
    webSocketImpl: WebSocket,
    connectionParams: { cookie },
    retryAttempts: 0,
  });
  const unsubscribe = client.subscribe(
    { query },
    {
      next: (result) => events.push(result.data),
      error: (error) => console.log('        (subscription errou)', String(error)),
      complete: () => {},
    },
  );
  return { events, close: () => { unsubscribe(); void client.dispose(); } };
}

const until = async (condition, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // `await` porque há condições que consultam o broker: para as síncronas isto é um no-op.
    const answer = await condition();
    if (answer) return answer;
    if (Date.now() > deadline) return null;
    await sleep(250);
  }
};

const POST_FIELDS = 'id version tags(first: 5) { edges { node { id name } } totalCount }';

// ------------------------------------------------------------------ 1 e 2

const { cookie, credentialId } = await signUp();
promoteToAuthor(credentialId);

console.log('=== 1. createPost responde PRÉ-CRIADO (v1, sem tag) ===');
const subscription = subscribe(`subscription { onPostCreated { ${POST_FIELDS} } }`, cookie);
await sleep(1000);

const created = await gql(
  `mutation { createPost(input: { title: "Saga coreografada", content: "c" }) { ${POST_FIELDS} } }`,
  cookie,
);
const post = created?.data?.createPost;
if (!post?.id) {
  bad('createPost', JSON.stringify(created).slice(0, 400));
  process.exit(1);
}
const postId = post.id;
if (post.version === 1 && post.tags.totalCount === 0) {
  ok('createPost respondeu v1 sem tag — o tagueamento saiu do fluxo da escrita', `postId ${postId}`);
} else {
  bad(
    'createPost devia responder v1 sem tag',
    `v${post.version}, ${post.tags.totalCount} tag(s) — o passo está rodando em processo`,
  );
}

console.log('=== 2. a subscription recebe o post COMPLETO depois da volta da saga ===');
const complete = await until(() =>
  subscription.events.map((event) => event?.onPostCreated).find((one) => one?.id === postId && one?.version === 2),
);
subscription.close();
if (complete) {
  const names = complete.tags.edges.map((edge) => edge.node.name);
  if (names.includes('Untagged')) {
    ok(`onPostCreated emitiu o post pronto: v${complete.version}, tags ${JSON.stringify(names)}`);
  } else {
    bad('o post chegou completo mas sem a tag padrão', JSON.stringify(names));
  }
} else {
  bad(
    'a subscription não recebeu o post completo',
    `${subscription.events.length} evento(s) no fio; a saga não fechou`,
  );
}

// ------------------------------------------------------------------ 3

console.log('=== 3. o estado durável de cada serviço é exatamente o esperado ===');
const [row] = read('posts', 'select version, published_at from posts where id = ?', postId);
const tagLinks = read(
  'posts',
  'select t.name from posts_tags pt join tags t on t.id = pt.tag_id where pt.post_id = ?',
  postId,
);
if (row?.version === 2 && row.published_at && tagLinks.map((one) => one.name).includes('Untagged')) {
  ok(`posts-api: o post está na v2, publicado, com ${JSON.stringify(tagLinks.map((one) => one.name))}`);
} else {
  bad('o read model da posts-api divergiu', JSON.stringify({ row, tagLinks }));
}

const stream = read(
  'tagging',
  'select sequence, message_type from event_log where stream_id = ? order by sequence',
  postId,
);
const streamed = stream.map((one) => one.message_type);
// O tagging tem os DOIS eventos, e produziu um deles: ingeriu o PostPreCreated e apendou o PostCreated.
// É essa simetria que prova a integração — e é aqui que um laço de reenvio apareceria, como contagem
// crescendo.
const expected = ['posts.PostPreCreated#1.0.0', 'posts.PostCreated#2.0.0'];
if (JSON.stringify(streamed) === JSON.stringify(expected)) {
  ok(`tagging: ${streamed.join(', ')}`, 'o evento INGERIDO está no stream dele — a fila não é a fonte');
} else {
  bad('o stream do tagging divergiu', `esperado [${expected}], obtido [${streamed}]`);
}

// ------------------------------------------------------------------ 4

console.log('=== 4. o inbox registrou uma linha por mensagem recebida ===');
const postsInbox = read('posts', 'select message_type, origin from transport_message_inbox');
const taggingInbox = read('tagging', 'select message_type, origin from transport_message_inbox');
if (postsInbox.some((one) => one.message_type.startsWith('posts.PostCreated') && one.origin === 'tagging')) {
  ok(`posts-api ingeriu de 'tagging': ${JSON.stringify(postsInbox)}`);
} else {
  bad('inbox da posts-api', JSON.stringify(postsInbox) || '(vazio)');
}
if (
  taggingInbox.some((one) => one.message_type.startsWith('posts.PostPreCreated') && one.origin === 'posts-api')
) {
  ok(`tagging ingeriu de 'posts-api': ${JSON.stringify(taggingInbox)}`);
} else {
  bad('inbox do tagging', JSON.stringify(taggingInbox) || '(vazio)');
}

// ------------------------------------------------------------------ 5

console.log('=== 5. reentregar a MESMA mensagem não produz uma segunda decisão ===');
// O envelope é montado à mão e publicado pela API de management — o que também valida o formato de fio:
// o corpo é o evento como a aplicação o escreveu, e tudo o que se diz sobre ele vai nos HEADERS AMQP.
const [ingested] = read(
  'tagging',
  'select identifier, message_type, payload from event_log where stream_id = ? and message_type like ?',
  postId,
  'posts.PostPreCreated%',
);
const republished = await fetch(`${RABBIT}/exchanges/%2F/${EXCHANGE}/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: RABBIT_AUTH },
  body: JSON.stringify({
    properties: {
      headers: {
        'cqrs-transport-message-type': ingested.message_type,
        'cqrs-transport-identifier': ingested.identifier,
        'cqrs-transport-timestamp': new Date().toISOString(),
        'cqrs-transport-origin': 'posts-api',
        'cqrs-transport-tags': `postId=${postId}`,
      },
    },
    routing_key: `posts.PostPreCreated.${postId}`,
    payload: JSON.stringify({
      pattern: `posts.PostPreCreated.${postId}`,
      data: JSON.parse(ingested.payload),
    }),
    payload_encoding: 'string',
  }),
});
const routed = await republished.json();
if (routed.routed !== true) {
  bad('republicar a mensagem', `o broker não roteou: ${JSON.stringify(routed)}`);
} else {
  ok('mensagem reentregue no mesmo identificador');
  await sleep(4000);
  const after = read(
    'tagging',
    'select count(*) as total from event_log where stream_id = ? and message_type like ?',
    postId,
    'posts.PostCreated%',
  );
  if (after[0].total === 1) {
    ok('o tagging continua com UM PostCreated — inbox e agregado seguraram a duplicata');
  } else {
    bad('a reentrega duplicou a decisão', `${after[0].total} eventos PostCreated no stream do tagging`);
  }
  const rows = read('tagging', 'select count(*) as total from transport_message_inbox where identifier = ?', ingested.identifier);
  if (rows[0].total === 1) {
    ok('o inbox tem UMA linha para o identificador reentregue');
  } else {
    bad('linhas de inbox para a mensagem reentregue', rows[0].total);
  }
}

// ------------------------------------------------------------------ 6

console.log('=== 6. o canal de RÉPLICA mantém o stream do Post completo no outro serviço ===');
/*
 * O tagging não reage a PostUpdated — mas precisa TER o evento, porque ele escreve no stream do Post e
 * uma decisão tomada contra metade da história é uma decisão errada. Um canal para isso, com routing
 * keys próprias, é o que um canal único não conseguia expressar.
 */
const updated = await gql(
  'mutation Editar($id: ID!) { updatePost(input: { id: $id, title: "Saga editada" }) { version } }',
  cookie,
  { id: postId },
);
if (updated?.data?.updatePost?.version !== 3) {
  bad('updatePost', JSON.stringify(updated).slice(0, 300));
} else {
  ok('post editado na posts-api (v3)');
  const replicated = await until(() => {
    const types = read(
      'tagging',
      'select message_type from event_log where stream_id = ? order by sequence',
      postId,
    ).map((one) => one.message_type);
    return types.some((type) => type.startsWith('posts.PostUpdated')) ? types : null;
  }, 20_000);
  if (replicated) {
    ok(
      `o stream replicou no tagging: ${replicated.join(', ')}`,
      'ninguém reagiu ao evento — ele está lá para a próxima decisão não ser tomada contra meia história',
    );
  } else {
    bad('o canal de réplica não trouxe o PostUpdated', 'o stream do tagging não ganhou o evento');
  }
}

// ------------------------------------------------------------------ 7

console.log('=== 7. uma request, um correlation id — atravessando os dois processos ===');
/*
 * Uma fila espiã ligada a `posts.#` guarda o que passou pelo exchange. Os headers AMQP são onde a
 * integração escreve o que a request significa, então o correlation id do PostPreCreated (produzido
 * pela posts-api) e o do PostCreated (produzido pelo tagging, do outro lado do fio) têm de ser o mesmo
 * valor: é isso que liga a linha de log do segundo serviço à mutation do primeiro.
 */
const SPY = 'nestposts.e2e.correlation-spy';
await fetch(`${RABBIT}/queues/%2F/${SPY}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', Authorization: RABBIT_AUTH },
  body: JSON.stringify({ durable: false, auto_delete: true }),
});
await fetch(`${RABBIT}/bindings/%2F/e/${EXCHANGE}/q/${SPY}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: RABBIT_AUTH },
  body: JSON.stringify({ routing_key: 'posts.#' }),
});

const traced = await gql(
  'mutation Criar { createPost(input: { title: "Uma request só", content: "oi" }) { id version } }',
  cookie,
);
const tracedId = traced?.data?.createPost?.id;
// Cada `get` CONSOME o que devolve, então as mensagens são acumuladas: as duas da saga não chegam
// necessariamente na mesma leitura — a segunda depende da volta pelo outro processo.
const spied = new Map();
const correlations = await until(async () => {
  const response = await fetch(`${RABBIT}/queues/%2F/${SPY}/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: RABBIT_AUTH },
    body: JSON.stringify({ count: 50, ackmode: 'ack_requeue_false', encoding: 'auto' }),
  });
  const messages = await response.json();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message.routing_key.endsWith(tracedId)) {
      spied.set(message.routing_key.split('.')[1], message);
    }
  }
  const born = spied.get('PostPreCreated');
  const completed = spied.get('PostCreated');
  return born && completed
    ? {
        born: born.properties.headers['cqrs-transport-correlation-id'],
        bornOrigin: born.properties.headers['cqrs-transport-origin'],
        completed: completed.properties.headers['cqrs-transport-correlation-id'],
        completedOrigin: completed.properties.headers['cqrs-transport-origin'],
      }
    : null;
}, 20_000);

if (!correlations) {
  bad('as duas mensagens da saga na fila espiã', 'não chegaram as duas em 20s');
} else if (!correlations.born || correlations.born !== correlations.completed) {
  bad(
    'um correlation id para a saga inteira',
    `posts-api: ${correlations.born} / tagging: ${correlations.completed}`,
  );
} else {
  ok(
    `a saga inteira sob um correlation id: ${correlations.born}`,
    `${correlations.bornOrigin} abriu a request e ${correlations.completedOrigin} publicou dentro dela`,
  );
}
await fetch(`${RABBIT}/queues/%2F/${SPY}`, { method: 'DELETE', headers: { Authorization: RABBIT_AUTH } });

console.log(`\n=== SAGA COREOGRAFADA: ${pass} passaram, ${fail} falharam ===`);
process.exit(fail === 0 ? 0 : 1);
