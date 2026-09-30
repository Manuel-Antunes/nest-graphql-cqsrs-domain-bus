import type { CompiledSubAgent, SubAgent } from 'deepagents';

import type { IWithSkills } from '../domain/interfaces/agent.interface';
import type { Skill } from '../domain/skill.entity';
import { StaticFilesBackend } from './static-files.backend';

export class SkillsBackend extends StaticFilesBackend {
  static readonly ROUTE = '/skills/';
  private static readonly BUNDLES = [
    'references',
    'scripts',
    'assets',
  ] as const;

  constructor(skills: readonly Skill[]) {
    super(SkillsBackend.filesOf(skills));
  }

  static directoryOf(skill: Skill): string {
    return `${SkillsBackend.ROUTE}${skill.name}/`;
  }

  static directoriesOf(skills: readonly Skill[]): string[] {
    return skills.map(SkillsBackend.directoryOf);
  }

  static pathOf(skill: Skill): string {
    return `${SkillsBackend.directoryOf(skill)}SKILL.md`;
  }

  static collect(
    ...sources: (readonly Skill[] | IWithSkills | unknown)[]
  ): Skill[] {
    const byName = new Map<string, Skill>();
    for (const source of sources) {
      for (const skill of SkillsBackend.skillsOf(source)) {
        if (!byName.has(skill.name)) byName.set(skill.name, skill);
      }
    }
    return [...byName.values()];
  }

  static filesOf(skills: readonly Skill[]): Record<string, string> {
    const files: Record<string, string> = {};
    for (const skill of skills) {
      files[`/${skill.name}/SKILL.md`] = skill.content;
      for (const folder of SkillsBackend.BUNDLES) {
        for (const file of skill[folder]) {
          files[`/${skill.name}/${folder}/${file.name}`] = file.content;
        }
      }
    }
    return files;
  }

  static supervisorDirectories(
    skills: readonly Skill[],
    subagents: readonly (SubAgent | CompiledSubAgent)[],
  ): string[] {
    const claimed = new Set(
      subagents.flatMap((subagent) =>
        'skills' in subagent ? ((subagent.skills as string[]) ?? []) : [],
      ),
    );
    return SkillsBackend.directoriesOf(skills).filter(
      (directory) => !claimed.has(directory),
    );
  }

  private static skillsOf(source: unknown): readonly Skill[] {
    if (Array.isArray(source)) return source as Skill[];
    const declared = (source as IWithSkills | undefined)?.skills;
    return Array.isArray(declared) ? declared : [];
  }
}
