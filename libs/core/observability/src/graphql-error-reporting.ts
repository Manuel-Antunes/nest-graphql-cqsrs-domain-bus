import type { ExecutionResult, GraphQLError } from 'graphql';
import { getOperationAST } from 'graphql';
import type { Plugin } from 'graphql-yoga';

import { reportError } from './error-reporting';

/**
 * Whether a result's error is one nobody answered: its `originalError` is what a resolver — or, in
 * a gateway, the call to a subgraph — threw, and it is not a `GraphQLError`. Whatever an exception
 * filter turned into an answer (`BAD_USER_INPUT`, `UNAUTHENTICATED`), and whatever a subgraph
 * answered and a gateway relayed, arrives as a `GraphQLError` and is somebody's answer, not this
 * process's failure. It is the error Yoga would mask.
 *
 * Read by its tag rather than with `instanceof`: under Vitest a Nest application's schema is built
 * by the CommonJS `graphql` and this module loads the ESM one.
 */
const unanswered = (error: GraphQLError): Error | undefined => {
  const original = error.originalError;
  return original &&
    Object.prototype.toString.call(original) !== '[object GraphQLError]'
    ? original
    : undefined;
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof (value as AsyncIterable<unknown> | undefined)?.[
    Symbol.asyncIterator
  ] === 'function';

/**
 * **The GraphQL errors this process did not answer, reported** — a Yoga plugin, beside
 * `useGraphQLTracing`, because Yoga is what executes and what sees every error of a result, the
 * gateway's included.
 *
 * Each is reported with its path and operation, while the operation's trace is active, and before
 * the result leaves: in a Lambda the response waits for the report (see `reportError`).
 */
export const useGraphQLErrorReporting = (): Plugin => ({
  onExecute: ({ args }) => ({
    onExecuteDone: async ({ result }) => {
      if (isAsyncIterable(result)) {
        return;
      }
      for (const error of (result as ExecutionResult).errors ?? []) {
        const failure = unanswered(error);
        if (failure) {
          await reportError(failure, {
            mechanism: { handled: false, type: 'auto.graphql.yoga' },
            captureContext: {
              contexts: {
                graphql: {
                  operation:
                    getOperationAST(args.document, args.operationName)?.name
                      ?.value ?? null,
                  path: error.path?.join('.') ?? null,
                },
              },
            },
          });
        }
      }
    },
  }),
});
