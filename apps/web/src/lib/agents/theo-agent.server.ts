import 'server-only';

import { HttpAgent, type HttpAgentFetchFn } from '@ag-ui/client';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';

import { env } from '@/env.mjs';
import { WebAuth } from '@/lib/auth/server';

export class TheoAgent {
  static readonly ID = 'theo';

  static readonly SCOPES = [
    'openid',
    'profile',
    'email',
    'read:posts',
    'write:posts',
  ] as const;

  static readonly SESSION_HEADER =
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id';

  private static readonly SESSION_MIN_LENGTH = 33;

  static for(identity: Identity): HttpAgent {
    return new HttpAgent({
      agentId: TheoAgent.ID,
      url: env.THEO_AGENT_URL,
      fetch: TheoAgent.fetchAs(identity),
    });
  }

  private static fetchAs(identity: Identity): HttpAgentFetchFn {
    return async (url, init) => {
      const headers = new Headers(init.headers);
      const token = await WebAuth.delegatedToken(identity, {
        audiences: env.THEO_AGENT_AUDIENCES,
        scopes: TheoAgent.SCOPES,
      });
      headers.set('authorization', `Bearer ${token}`);
      const session = TheoAgent.sessionOf(init.body);
      if (session) headers.set(TheoAgent.SESSION_HEADER, session);
      return fetch(url, { ...init, headers });
    };
  }

  private static sessionOf(body: RequestInit['body']): string | undefined {
    if (typeof body !== 'string') return undefined;
    try {
      const { threadId } = JSON.parse(body) as { threadId?: unknown };
      return typeof threadId === 'string' &&
        threadId.length >= TheoAgent.SESSION_MIN_LENGTH
        ? threadId
        : undefined;
    } catch {
      return undefined;
    }
  }
}
