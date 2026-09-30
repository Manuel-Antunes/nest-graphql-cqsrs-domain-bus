import type { Skill } from '../skill.entity';

export interface IAgent<T> {
  get agent(): T;
}

export interface IWithSkills {
  skills: Skill[];
}
