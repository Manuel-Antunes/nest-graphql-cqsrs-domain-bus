import type { BackendProtocolV2, CompiledSubAgent, SubAgent } from 'deepagents';

export interface ISubAgent {
  subAgent(backend: BackendProtocolV2): SubAgent | CompiledSubAgent;
}

export interface IWithBackend {
  readonly backend: BackendProtocolV2;
}

export interface IAgentBuilder<T> {
  build(backend?: BackendProtocolV2): T;
}

export type { IWithSkills } from '../domain/interfaces/agent.interface';
