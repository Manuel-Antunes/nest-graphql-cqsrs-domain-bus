import { join } from 'node:path';

export class Workspace {
  static readonly ROOT = new URL('../../../..', import.meta.url).pathname;

  static path(...segments: string[]): string {
    return join(Workspace.ROOT, ...segments);
  }
}
