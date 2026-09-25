'use client';

import type { SubscriptionHandlers } from '@nestposts/tanstack-query-graphql';
import { toRequestString } from '@nestposts/tanstack-query-graphql';
import type { Client } from 'graphql-sse';
import { createClient } from 'graphql-sse';

import { env } from '@/env.mjs';
import type { TypedDocumentString } from '@/gql/graphql';

import { TenantHeader } from './tenant';

const CONNECT_DEADLINE_MS = 45_000;
const RETRY_ATTEMPTS = 5;

let client: Client | undefined;

const sse = (): Client => {
  client ??= createClient({
    url: env.NEXT_PUBLIC_GATEWAY_URL,
    singleConnection: false,
    retryAttempts: RETRY_ATTEMPTS,
    headers: () => TenantHeader.headers(),
  });
  return client;
};

export function subscribe<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables: TVariables,
  handlers: SubscriptionHandlers<TResult>,
): () => void {
  let connected = false;

  const deadline = setTimeout(() => {
    if (connected) return;
    dispose();
    handlers.error?.(
      new Error(
        `O stream não abriu em ${CONNECT_DEADLINE_MS / 1000}s. Veja os logs da posts-api.`,
      ),
    );
  }, CONNECT_DEADLINE_MS);

  const announce = () => {
    connected = true;
    clearTimeout(deadline);
  };

  const dispose = sse().subscribe<TResult>(
    {
      query: toRequestString(document),
      variables: variables as Record<string, unknown> | undefined,
    },
    {
      next: (result) => {
        announce();
        if (result.errors?.length) {
          handlers.error?.(result.errors);
        } else if (result.data) {
          handlers.next(result.data);
        }
      },
      error: (error) => {
        clearTimeout(deadline);
        handlers.error?.(error);
      },
      complete: () => {
        clearTimeout(deadline);
        handlers.complete?.();
      },
    },
    {
      connecting: (reconnecting) => handlers.connecting?.(reconnecting),
      connected: (reconnected) => {
        announce();
        handlers.connected?.(reconnected);
      },
    },
  );

  return () => {
    clearTimeout(deadline);
    dispose();
  };
}
