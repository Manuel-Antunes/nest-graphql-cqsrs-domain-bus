import {
  AbstractAgent,
  type AgentConfig,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import type { Tool } from '@ag-ui/core';
import { Observable } from 'rxjs';

import type { RemoteA2aAgents } from '../../a2a/client/remote-a2a-agents';
import { A2aMiddlewareRun } from './a2a-middleware.run';

export interface A2aMiddlewareAgentConfig extends AgentConfig {
  readonly orchestrator: AbstractAgent;
  readonly agents: Pick<RemoteA2aAgents, 'names' | 'reach'>;
  readonly traceName?: string;
  readonly maxRounds?: number;
}

export class A2aMiddlewareAgent extends AbstractAgent {
  static readonly DELEGATION_TOOL = 'send_message_to_a2a_agent';
  static readonly MAX_ROUNDS = 8;

  private middleware: A2aMiddlewareAgentConfig;

  constructor(config: A2aMiddlewareAgentConfig) {
    super(config);
    this.middleware = config;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const run = new A2aMiddlewareRun(
        {
          orchestrator: this.middleware.orchestrator,
          agents: this.middleware.agents,
          delegationTool: A2aMiddlewareAgent.delegationTool(
            this.middleware.agents,
          ),
          traceName:
            this.middleware.traceName ?? this.agentId ?? 'a2a-middleware',
          maxRounds: this.middleware.maxRounds ?? A2aMiddlewareAgent.MAX_ROUNDS,
        },
        input,
        (event) => subscriber.next(event),
      );
      void run.traced().then(
        () => subscriber.complete(),
        (error: unknown) => subscriber.error(error),
      );
      return () => run.abort();
    });
  }

  override clone(): A2aMiddlewareAgent {
    const cloned = super.clone() as A2aMiddlewareAgent;
    cloned.middleware = this.middleware;
    return cloned;
  }

  static delegationTool(
    agents: Pick<RemoteA2aAgents, 'names'>,
  ): Tool | undefined {
    if (agents.names.length === 0) return undefined;
    return {
      name: A2aMiddlewareAgent.DELEGATION_TOOL,
      description:
        'Sends a task to the remote agent named `agentName`, with the conversation context it needs and the goal, and answers with what that agent replied.',
      parameters: {
        type: 'object',
        properties: {
          agentName: {
            type: 'string',
            enum: agents.names,
            description: 'The name of the agent to send the task to.',
          },
          task: {
            type: 'string',
            description:
              'Everything the agent needs to act: the goal, and every detail from the conversation it depends on — the agent has not seen this conversation.',
          },
        },
        required: ['agentName', 'task'],
      },
    };
  }
}
