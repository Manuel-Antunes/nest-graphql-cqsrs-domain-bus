#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { HttpAgent } from '@ag-ui/client';

const CLIENT_ID = 'agent-console';
const REDIRECT_URI = 'http://127.0.0.1:8976/callback';
const SCOPES = 'openid profile email offline_access read:posts write:posts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    issuer: { type: 'string', default: 'http://localhost:4000' },
    'auth-path': { type: 'string', default: '/api/auth' },
    agent: { type: 'string', default: 'http://localhost:8080/invocations' },
    'agent-resource': { type: 'string', default: 'http://localhost:8080/' },
    'posts-agent-resource': {
      type: 'string',
      default: 'http://localhost:9000/',
    },
    'mcp-resource': { type: 'string', default: 'http://localhost:8000/mcp' },
    email: { type: 'string', default: 'manuel@example.com' },
    password: { type: 'string', default: 'segredo123' },
    token: { type: 'boolean', default: false },
  },
});

const issuer = values.issuer.replace(/\/+$/, '');
const auth = `${issuer}${values['auth-path']}`;
const messages = positionals.length ? positionals : ['Who am I?'];
const resources = [
  values['agent-resource'],
  values['posts-agent-resource'],
  values['mcp-resource'],
];

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
  ...resources.map((resource) => ['resource', resource]),
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
for (const resource of resources) body.append('resource', resource);
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

const threadId = randomUUID();
const theo = new HttpAgent({
  url: values.agent,
  threadId,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': threadId,
  },
});

for (const text of messages) {
  console.log(`\n> ${text}`);
  theo.addMessage({ id: randomUUID(), role: 'user', content: text });
  await theo.runAgent(
    {},
    {
      onTextMessageContentEvent: ({ event }) => {
        process.stdout.write(
          event.subagentRunId ? `\x1b[2m${event.delta}\x1b[0m` : event.delta,
        );
      },
      onTextMessageEndEvent: () => {
        process.stdout.write('\n');
      },
      onSubagentStartedEvent: ({ event }) => {
        console.log(`\x1b[2m[${event.name}]\x1b[0m`);
      },
      onToolCallEndEvent: ({ toolCallName, toolCallArgs }) => {
        console.log(
          `\x1b[2m→ ${toolCallName} ${JSON.stringify(toolCallArgs)}\x1b[0m`,
        );
      },
      onRunErrorEvent: ({ event }) => {
        console.error(`run failed: ${event.code ?? ''} ${event.message}`);
      },
    },
  );
}
