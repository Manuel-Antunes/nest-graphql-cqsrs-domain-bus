import { randomUUID } from 'node:crypto';
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
} from '@langchain/core/messages';
import { type BaseStore, getConfig } from '@langchain/langgraph';
import { type AnyAgentMiddleware, createMiddleware } from 'langchain';

import { SystemGuidance } from './system-guidance';

export interface LongTermMemoryOptions {
  readonly recall: readonly string[];
  readonly limit?: number;
}

interface Whereabouts {
  readonly store: BaseStore;
  readonly actorId: string;
  readonly threadId: string;
}

export class LongTermMemoryMiddleware {
  static readonly HEADING = '## What you remember about this person';
  static readonly DEFAULT_LIMIT = 5;
  private static readonly RECALLED = 100;

  private readonly recalled = new Map<string, Promise<string[]>>();

  constructor(private readonly options: LongTermMemoryOptions) {}

  static create(options: LongTermMemoryOptions): AnyAgentMiddleware {
    return new LongTermMemoryMiddleware(options).build();
  }

  static whereabouts(
    store: BaseStore | undefined,
    configurable: Record<string, unknown> | undefined,
  ): Whereabouts | undefined {
    const actorId = configurable?.actor_id;
    const threadId = configurable?.thread_id;
    return store &&
      typeof actorId === 'string' &&
      actorId &&
      typeof threadId === 'string' &&
      threadId
      ? { store, actorId, threadId }
      : undefined;
  }

  static spokenSince(messages: readonly BaseMessage[]): BaseMessage[] {
    const lastAnswer = messages.findLastIndex((message) =>
      AIMessage.isInstance(message),
    );
    return messages
      .slice(lastAnswer + 1)
      .filter((message) => HumanMessage.isInstance(message));
  }

  static answerOf(messages: readonly BaseMessage[]): AIMessage | undefined {
    const last = messages.at(-1);
    return AIMessage.isInstance(last) &&
      !last.tool_calls?.length &&
      last.text.trim()
      ? last
      : undefined;
  }

  static render(memories: readonly string[]): string | undefined {
    if (memories.length === 0) return undefined;
    return [
      LongTermMemoryMiddleware.HEADING,
      'From earlier conversations with this person, in this organization:',
      ...memories.map((memory) => `- ${memory}`),
    ].join('\n');
  }

  build(): AnyAgentMiddleware {
    return createMiddleware({
      name: 'LongTermMemory',
      beforeAgent: async (state, runtime) => {
        const where = LongTermMemoryMiddleware.whereabouts(
          runtime.store,
          getConfig().configurable,
        );
        if (!where) return undefined;
        for (const message of LongTermMemoryMiddleware.spokenSince(
          state.messages as BaseMessage[],
        )) {
          await this.remember(where, message);
        }
        return undefined;
      },
      afterAgent: async (state, runtime) => {
        const where = LongTermMemoryMiddleware.whereabouts(
          runtime.store,
          getConfig().configurable,
        );
        const answer = LongTermMemoryMiddleware.answerOf(
          state.messages as BaseMessage[],
        );
        if (where && answer) await this.remember(where, answer);
        return undefined;
      },
      wrapModelCall: async (request, handler) => {
        const where = LongTermMemoryMiddleware.whereabouts(
          request.runtime.store,
          getConfig().configurable,
        );
        const asked = (request.messages as BaseMessage[]).findLast((message) =>
          HumanMessage.isInstance(message),
        )?.text;
        if (!where || !asked?.trim()) return handler(request);
        const memories = await this.recall(where, asked);
        return handler({
          ...request,
          systemMessage: SystemGuidance.append(
            request,
            LongTermMemoryMiddleware.render(memories),
          ),
        });
      },
    });
  }

  private async remember(
    { store, actorId, threadId }: Whereabouts,
    message: BaseMessage,
  ): Promise<void> {
    await store.put([actorId, threadId], message.id ?? randomUUID(), {
      message,
    });
  }

  private recall(
    { store, actorId }: Whereabouts,
    query: string,
  ): Promise<string[]> {
    const key = JSON.stringify([actorId, query]);
    const known = this.recalled.get(key);
    if (known) return known;
    const recalling = Promise.all(
      this.options.recall.map((namespace) =>
        store.search([namespace, actorId], {
          query,
          limit: this.options.limit ?? LongTermMemoryMiddleware.DEFAULT_LIMIT,
        }),
      ),
    )
      .then((found) =>
        found
          .flat()
          .map((item) => String(item.value.content ?? ''))
          .filter((content) => content.trim()),
      )
      .catch(() => []);
    if (this.recalled.size >= LongTermMemoryMiddleware.RECALLED) {
      this.recalled.delete(this.recalled.keys().next().value as string);
    }
    this.recalled.set(key, recalling);
    return recalling;
  }
}
