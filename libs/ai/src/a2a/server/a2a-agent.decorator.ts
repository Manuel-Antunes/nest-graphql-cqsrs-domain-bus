import 'reflect-metadata';

import type { AgentCard } from '@a2a-js/sdk';
import type { AgentExecutor, TaskStore } from '@a2a-js/sdk/server';
import type { Type } from '@nestjs/common';

import { Skill } from '../../domain/skill.entity';
import type { A2aExecutorFactory } from './lazy-agent.executor';

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

export type A2aSkill = A2aSkillConfig | Skill;

export type A2aAgentCardOverrides = Partial<
  Omit<AgentCard, 'skills' | 'supportedInterfaces'>
>;

export interface A2aAgentConfig {
  id: string;
  name?: string;
  description?: string;
  referenceId?: string;
  skills?: readonly A2aSkill[];
  card?: A2aAgentCardOverrides;
}

export interface A2aAgent {
  readonly executor: AgentExecutor | A2aExecutorFactory;
  readonly skills?: readonly A2aSkill[];
  readonly card?: A2aAgentCardOverrides;
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

  static skillsOf(skills: readonly A2aSkill[]): A2aSkillConfig[] {
    return skills.map((skill) =>
      skill instanceof Skill
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            tags: skill.tags,
            examples: skill.examples,
          }
        : skill,
    );
  }
}

export function A2aAgent(config: A2aAgentConfig) {
  return <T extends Type<A2aAgent>>(target: T): T => {
    A2aAgentDeclaration.declare(target, config);
    return target;
  };
}
