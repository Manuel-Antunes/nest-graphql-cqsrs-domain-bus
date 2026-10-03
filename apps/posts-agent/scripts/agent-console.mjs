#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  ClientFactory,
  ClientFactoryOptions,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';

const CLIENT_ID = 'agent-console';
const REDIRECT_URI = 'http://127.0.0.1:8976/callback';
const SCOPES = 'openid profile email offline_access read:posts write:posts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    issuer: { type: 'string', default: 'http://localhost:4000' },
    'auth-path': { type: 'string', default: '/api/auth' },
    agent: { type: 'string', default: 'http://localhost:9000/' },
    'agent-resource': { type: 'string', default: 'http://localhost:9000/' },
    'mcp-resource': { type: 'string', default: 'http://localhost:8000/mcp' },
    email: { type: 'string', default: 'manuel@example.com' },
    password: { type: 'string', default: 'segredo123' },
    token: { type: 'boolean', default: false },
  },
});

const issuer = values.issuer.replace(/\/+$/, '');
const auth = `${issuer}${values['auth-path']}`;
const messages = positionals.length ? positionals : ['Who am I?'];

const fail = async (step, response) => {
  throw new Error(`${step}: ${response.status} ${await response.text()}`);
};

const signIn = await fetch(`${auth}/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: issuer },
  body: JSON.stringify({ email: values.email, password: values.password }),
});
if (!signIn.ok) await fail('sign-in', signIn);
const cookie = signIn.headers
  .getSetCookie()
  .map((header) => header.split(';')[0])
  .join('; ');

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomUUID();
const authorize = new URL(`${auth}/oauth2/authorize`);
for (const [name, value] of [
  ['response_type', 'code'],
  ['client_id', CLIENT_ID],
  ['redirect_uri', REDIRECT_URI],
  ['scope', SCOPES],
  ['state', state],
  ['code_challenge', challenge],
  ['code_challenge_method', 'S256'],
  ['resource', values['agent-resource']],
  ['resource', values['mcp-resource']],
]) {
  authorize.searchParams.append(name, value);
}
const authorized = await fetch(authorize, {
  headers: { cookie },
  redirect: 'manual',
});
const location =
  authorized.headers.get('location') ??
  (await authorized.json().catch(() => ({}))).url;
if (!location) await fail('authorize', authorized);
const callback = new URL(location, issuer);
const code = callback.searchParams.get('code');
if (!code || callback.searchParams.get('state') !== state) {
  throw new Error(`authorize: no code in ${callback.href}`);
}

const body = new URLSearchParams({
  grant_type: 'authorization_code',
  code,
  redirect_uri: REDIRECT_URI,
  client_id: CLIENT_ID,
  code_verifier: verifier,
});
body.append('resource', values['agent-resource']);
body.append('resource', values['mcp-resource']);
const exchanged = await fetch(`${auth}/oauth2/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
});
if (!exchanged.ok) await fail('token', exchanged);
const { access_token: accessToken } = await exchanged.json();
const claims = JSON.parse(
  Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
);
console.error(
  `signed in as ${values.email}: sub=${claims.sub} aud=${JSON.stringify(claims.aud)} scope="${claims.scope}"`,
);
if (values.token) console.log(accessToken);

const contextId = randomUUID();
const session = `agent-console-${randomUUID()}`;
const fetchAsCaller = (input, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  headers.set('x-amzn-bedrock-agentcore-runtime-session-id', session);
  return fetch(input, { ...init, headers });
};
const factory = new ClientFactory(
  ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
    transports: [new JsonRpcTransportFactory({ fetchImpl: fetchAsCaller })],
  }),
);
const cardResponse = await fetchAsCaller(
  new URL('.well-known/agent-card.json', values.agent),
  { headers: { 'A2A-Version': '1.0' } },
);
if (!cardResponse.ok) await fail('agent card', cardResponse);
const card = await cardResponse.json();
console.error(
  `agent: ${card.name} — ${card.skills.map((skill) => skill.name).join(', ')}`,
);
const client = await factory.createFromAgentCard(card);

const textOf = (parts = []) =>
  parts
    .map((part) =>
      part.content?.$case === 'text' ? part.content.value : (part.text ?? ''),
    )
    .join('');

for (const text of messages) {
  console.log(`\n> ${text}`);
  let streamed = '';
  let final = '';
  let state;
  for await (const event of client.sendMessageStream({
    tenant: '',
    message: {
      messageId: randomUUID(),
      contextId,
      taskId: '',
      role: 1,
      parts: [
        {
          content: { $case: 'text', value: text },
          metadata: undefined,
          filename: '',
          mediaType: 'text/plain',
        },
      ],
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    },
    configuration: undefined,
    metadata: undefined,
  })) {
    const payload = event.payload ?? { $case: undefined };
    if (payload.$case === 'artifactUpdate') {
      const delta = textOf(payload.value.artifact?.parts);
      streamed += delta;
      process.stdout.write(delta);
    } else if (payload.$case === 'statusUpdate') {
      state = payload.value.status?.state ?? state;
      final = textOf(payload.value.status?.message?.parts) || final;
    } else if (payload.$case === 'message') {
      final = textOf(payload.value.parts) || final;
    }
  }
  if (!streamed) process.stdout.write(final);
  process.stdout.write('\n');
  if (!streamed && !final)
    console.error(`(no text; the task ended in state ${state})`);
}
