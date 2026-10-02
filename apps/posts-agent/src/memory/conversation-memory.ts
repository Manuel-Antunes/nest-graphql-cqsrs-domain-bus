import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  type Event,
  ListEventsCommand,
  Role,
} from '@aws-sdk/client-bedrock-agentcore';
import { Inject, Injectable, Logger } from '@nestjs/common';

import type { MemoryConfig } from '../config/memory.config';
import { memoryConfig } from '../config/memory.config';

export interface ConversationTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface ConversationThread {
  readonly actorId: string;
  readonly sessionId: string;
}

@Injectable()
export class ConversationMemory {
  private readonly logger = new Logger(ConversationMemory.name);
  private readonly client: BedrockAgentCoreClient | null;

  constructor(@Inject(memoryConfig.KEY) private readonly config: MemoryConfig) {
    this.client = config.memoryId
      ? new BedrockAgentCoreClient({ region: config.region })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async remember(
    thread: ConversationThread,
    turns: readonly ConversationTurn[],
  ): Promise<void> {
    const memoryId = this.config.memoryId;
    if (!this.client || !memoryId || turns.length === 0) return;
    try {
      await this.client.send(
        new CreateEventCommand({
          memoryId,
          actorId: thread.actorId,
          sessionId: thread.sessionId,
          eventTimestamp: new Date(),
          payload: turns.map(({ role, text }) => ({
            conversational: {
              role: role === 'user' ? Role.USER : Role.ASSISTANT,
              content: { text },
            },
          })),
        }),
      );
    } catch (error) {
      this.logger.warn(
        `could not remember a turn of ${thread.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async recall(thread: ConversationThread): Promise<ConversationTurn[]> {
    const memoryId = this.config.memoryId;
    if (!this.client || !memoryId) return [];
    try {
      const { events = [] } = await this.client.send(
        new ListEventsCommand({
          memoryId,
          actorId: thread.actorId,
          sessionId: thread.sessionId,
          includePayloads: true,
          maxResults: this.config.recallLimit,
        }),
      );
      return ConversationMemory.turnsOf(events);
    } catch (error) {
      this.logger.warn(
        `could not recall ${thread.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  static turnsOf(events: readonly Event[]): ConversationTurn[] {
    return [...events]
      .sort(
        (a, b) =>
          (a.eventTimestamp?.getTime() ?? 0) -
          (b.eventTimestamp?.getTime() ?? 0),
      )
      .flatMap((event) => event.payload ?? [])
      .flatMap(({ conversational }) => {
        const text = conversational?.content?.text;
        if (!text) return [];
        return [
          {
            role:
              conversational.role === Role.USER
                ? ('user' as const)
                : ('assistant' as const),
            text,
          },
        ];
      });
  }
}
