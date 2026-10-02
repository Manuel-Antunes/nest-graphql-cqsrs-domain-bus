import {
  type BaseCheckpointSaver,
  type BaseStore,
  InMemoryStore,
  MemorySaver,
} from '@langchain/langgraph';
import {
  AgentCoreMemorySaver,
  AgentCoreMemoryStore,
} from '@nestposts/langgraph-checkpoint-aws';

export interface AgentMemory {
  readonly memoryId: string | null;
  readonly region: string;
}

export class AgentMemories {
  static readonly FORMAT = 'snapshot';

  static checkpointerOf({
    memoryId,
    region,
  }: AgentMemory): BaseCheckpointSaver {
    return memoryId
      ? AgentMemories.checkpointerOn(memoryId, region)
      : new MemorySaver();
  }

  static checkpointerOn(
    memoryId: string,
    region: string,
  ): AgentCoreMemorySaver {
    return new AgentCoreMemorySaver(memoryId, {
      clientConfig: { region },
      checkpointFormat: AgentMemories.FORMAT,
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
