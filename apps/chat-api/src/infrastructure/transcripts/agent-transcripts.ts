import type { BaseMessage } from '@langchain/core/messages';
import { AgentMemories } from '@nestposts/ai/checkpoint/agent-memories';
import type { Chat } from '@nestposts/chat/domain/chat/chat.entity';
import type { AgentCoreMemorySaver } from '@nestposts/langgraph-checkpoint-aws';

import type { MemoryConfig } from '../../config/memory.config';

export class AgentTranscripts {
  constructor(
    private readonly savers: ReadonlyMap<string, AgentCoreMemorySaver>,
  ) {}

  static of({ memories, region }: MemoryConfig): AgentTranscripts {
    return new AgentTranscripts(
      new Map(
        memories.map(({ agentId, memoryId }) => [
          agentId,
          AgentMemories.checkpointerOn(memoryId, region),
        ]),
      ),
    );
  }

  async messagesOf(chat: Chat, tenant: string): Promise<BaseMessage[]> {
    const saver = this.savers.get(chat.agentId.value);
    if (!saver) return [];
    const tuple = await saver.getTuple({
      configurable: {
        thread_id: chat.threadId,
        actor_id: AgentTranscripts.actorOf(chat, tenant),
      },
    });
    const messages = tuple?.checkpoint.channel_values.messages;
    return Array.isArray(messages) ? (messages as BaseMessage[]) : [];
  }

  async forget(chat: Chat, tenant: string): Promise<void> {
    await this.savers
      .get(chat.agentId.value)
      ?.deleteThread(chat.threadId, AgentTranscripts.actorOf(chat, tenant));
  }

  private static actorOf(chat: Chat, tenant: string): string {
    return AgentMemories.actorOf(tenant, chat.owner.id.value);
  }
}
