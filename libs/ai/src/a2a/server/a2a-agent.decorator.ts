import 'reflect-metadata';

import type { AgentCard } from '@a2a-js/sdk';
import type { AgentExecutor, TaskStore } from '@a2a-js/sdk/server';
import type { Type } from '@nestjs/common';

import type { Skill } from '../../domain/skill.entity';

export interface A2aSkillConfig {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
  extensions?: string[];
}

export type A2aAgentCardOverrides = Partial<
  Omit<AgentCard, 'skills' | 'supportedInterfaces'>
>;

export interface A2aAgentConfig {
  id: string;
  name?: string;
  description?: string;
  referenceId?: string;
  skills: A2aSkillConfig[];
  card?: A2aAgentCardOverrides;
}

export interface A2aAgent {
  readonly executor: AgentExecutor;
  readonly skills?: A2aSkillConfig[];
  readonly taskStore: TaskStore;
}

export class A2aAgentDeclaration {
  private static readonly KEY = Symbol('a2a:agent');

  static declare(target: Type<A2aAgent>, config: A2aAgentConfig): void {
    Reflect.defineMetadata(A2aAgentDeclaration.KEY, config, target);
  }

  static of(target: Type<A2aAgent>): A2aAgentConfig | undefined {
    return Reflect.getOwnMetadata(A2aAgentDeclaration.KEY, target);
  }

  static skillsOf(skills: readonly Skill[]): A2aSkillConfig[] {
    return skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
    }));
  }
}

export function A2aAgent(config: A2aAgentConfig) {
  return <T extends Type<A2aAgent>>(target: T): T => {
    A2aAgentDeclaration.declare(target, config);
    return target;
  };
}
