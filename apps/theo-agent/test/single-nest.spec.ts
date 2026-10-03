import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCKFILE = join(__dirname, '..', '..', '..', 'pnpm-lock.yaml');

const variantsOf = (name: string): string[] => {
  const snapshots =
    readFileSync(LOCKFILE, 'utf8').split('\nsnapshots:\n')[1] ?? '';
  return snapshots
    .split('\n')
    .filter(
      (line) => line.startsWith(`  '${name}@`) || line.startsWith(`  ${name}@`),
    )
    .map((line) => line.trim().replace(/:$/, ''));
};

describe('what an agent image installs', () => {
  it('resolves one Nest: a second @nestjs/core is a second DI container and the agent dies at boot', () => {
    expect(variantsOf('@nestjs/core')).toHaveLength(1);
    expect(variantsOf('@nestjs/common')).toHaveLength(1);
  });
});
