import {
  type BaseCheckpointSaver,
  type BaseStore,
  InMemoryStore,
  MemorySaver,
} from '@langchain/langgraph';
import {
  AgentCoreMemorySaver,
  type AgentCoreMemorySaverOptions,
  AgentCoreMemoryStore,
} from '@nestposts/langgraph-checkpoint-aws';

export interface AgentMemory {
  readonly memoryId: string | null;
  readonly region: string;
}

export type AgentCheckpointOptions = Pick<
  AgentCoreMemorySaverOptions,
  'patchOrphanToolCalls' | 'client'
>;

export class AgentMemories {
  static readonly FORMAT = 'snapshot';
  static readonly FOR_CLIENT_TOOLS: AgentCheckpointOptions = {
    patchOrphanToolCalls: false,
  };

  static checkpointerOf(
    { memoryId, region }: AgentMemory,
    options: AgentCheckpointOptions = {},
  ): BaseCheckpointSaver {
    return memoryId
      ? AgentMemories.checkpointerOn(memoryId, region, options)
      : new MemorySaver();
  }

  static checkpointerOn(
    memoryId: string,
    region: string,
    options: AgentCheckpointOptions = {},
  ): AgentCoreMemorySaver {
    return new AgentCoreMemorySaver(memoryId, {
      clientConfig: { region },
      checkpointFormat: AgentMemories.FORMAT,
      ...options,
    });
  }

  static storeOf({ memoryId, region }: AgentMemory): BaseStore {
    return memoryId
      ? new AgentCoreMemoryStore(memoryId, { clientConfig: { region } })
      : new InMemoryStore();
  }

  static actorOf(tenant: string | undefined, userId: string): string {
    return tenant ? `${tenant}:${userId}` : userId;
  }
}
