import { StateBackend } from 'deepagents';

import { Skill } from '../domain/skill.entity';
import { SubAgentMiddleware } from './subagent-middleware';

const backend = () => new StateBackend() as never;

function names(middleware: { name: string }[]): string[] {
  return middleware.map((entry) => entry.name);
}

describe('the middleware a compiled subagent needs', () => {
  it('gives it a filesystem, a summarizer and tool-call patching', () => {
    expect(names(SubAgentMiddleware.for({ backend: backend() }))).toEqual([
      'FilesystemMiddleware',
      'SummarizationMiddleware',
      'patchToolCallsMiddleware',
    ]);
  });

  it('adds the skills middleware only when there are skills to load', () => {
    const skills = [
      Skill.create({ name: 'a-skill', description: 'd', body: 'b' }),
    ];

    expect(
      names(SubAgentMiddleware.for({ backend: backend(), skills })),
    ).toContain('SkillsMiddleware');
    expect(
      names(SubAgentMiddleware.for({ backend: backend(), skills: [] })),
    ).not.toContain('SkillsMiddleware');
  });

  it('keeps only the backend-free middleware when there is no backend', () => {
    expect(names(SubAgentMiddleware.for({}))).toEqual([
      'patchToolCallsMiddleware',
    ]);
  });

  it('puts the defaults before whatever the agent adds', () => {
    const stack = [
      ...SubAgentMiddleware.for({ backend: backend() }),
      { name: 'own' },
    ];

    expect(names(stack).at(-1)).toBe('own');
  });
});
