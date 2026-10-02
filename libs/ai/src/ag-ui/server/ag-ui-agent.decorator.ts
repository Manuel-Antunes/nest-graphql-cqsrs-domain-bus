import 'reflect-metadata';

import type { AbstractAgent } from '@ag-ui/client';
import type { Type } from '@nestjs/common';

export interface AgUiAgentConfig {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
}

export type AgUiAgentFactory = () => AbstractAgent | Promise<AbstractAgent>;

export interface AgUiAgent {
  readonly agent: AbstractAgent | AgUiAgentFactory;
}

export class AgUiAgentDeclaration {
  private static readonly KEY = Symbol('ag-ui:agent');

  static declare(target: Type<AgUiAgent>, config: AgUiAgentConfig): void {
    Reflect.defineMetadata(AgUiAgentDeclaration.KEY, config, target);
  }

  static of(target: Type<AgUiAgent>): AgUiAgentConfig | undefined {
    return Reflect.getOwnMetadata(AgUiAgentDeclaration.KEY, target);
  }
}

export function AgUiAgent(config: AgUiAgentConfig) {
  return <T extends Type<AgUiAgent>>(target: T): T => {
    AgUiAgentDeclaration.declare(target, config);
    return target;
  };
}
