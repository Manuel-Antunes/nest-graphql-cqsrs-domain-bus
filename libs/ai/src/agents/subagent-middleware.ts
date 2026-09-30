import {
  type BackendProtocolV2,
  createFilesystemMiddleware,
  createPatchToolCallsMiddleware,
  createSkillsMiddleware,
  createSummarizationMiddleware,
  type FilesystemMiddlewareOptions,
} from 'deepagents';
import type { AnyAgentMiddleware } from 'langchain';

import { SkillsBackend } from '../backends/skills.backend';
import type { Skill } from '../domain/skill.entity';

export interface SubAgentMiddlewareOptions {
  backend?: BackendProtocolV2;
  skills?: readonly Skill[];
  permissions?: FilesystemMiddlewareOptions['permissions'];
  tools?: FilesystemMiddlewareOptions['tools'];
}

export class SubAgentMiddleware {
  static for(options: SubAgentMiddlewareOptions = {}): AnyAgentMiddleware[] {
    const { backend, skills = [], permissions, tools } = options;
    const sources = SkillsBackend.directoriesOf(skills);

    return [
      ...(backend
        ? [
            createFilesystemMiddleware({
              backend,
              ...(permissions ? { permissions } : {}),
              ...(tools ? { tools } : {}),
            }),
            createSummarizationMiddleware({ backend }),
          ]
        : []),
      createPatchToolCallsMiddleware(),
      ...(backend && sources.length > 0
        ? [createSkillsMiddleware({ backend, sources })]
        : []),
    ] as AnyAgentMiddleware[];
  }
}
