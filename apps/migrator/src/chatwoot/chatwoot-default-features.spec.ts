import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHATWOOT_DEFAULT_FEATURE_FLAGS,
  CHATWOOT_DEFAULT_FEATURE_FLAGS_EXT_1,
} from '@nestposts/organizations/infrastructure/persistence/triggers/chatwoot-sync.triggers';

class ChatwootFeatures {
  static readonly FILE = join(
    process.cwd(),
    '..',
    'chatwoot',
    'config',
    'features.yml',
  );

  static enabledByDefault(): Map<string, bigint> {
    const masks = new Map<string, bigint>();
    const positions = new Map<string, number>();
    for (const entry of ChatwootFeatures.entries()) {
      const column =
        /^\s+column:\s*(\S+)\s*$/m.exec(entry)?.[1] ?? 'feature_flags';
      const position = positions.get(column) ?? 0;
      positions.set(column, position + 1);
      const enabled = /^\s+enabled:\s*true\s*$/m.test(entry);
      const mask = masks.get(column) ?? 0n;
      masks.set(column, enabled ? mask | (1n << BigInt(position)) : mask);
    }
    return masks;
  }

  private static entries(): string[] {
    return readFileSync(ChatwootFeatures.FILE, 'utf8')
      .split(/^- name:/m)
      .slice(1);
  }
}

describe('the accounts the platform creates in Chatwoot', () => {
  it('start with every feature Chatwoot enables by default, in each of its flag columns', () => {
    const defaults = ChatwootFeatures.enabledByDefault();

    expect(defaults.get('feature_flags')?.toString()).toBe(
      CHATWOOT_DEFAULT_FEATURE_FLAGS,
    );
    expect(defaults.get('feature_flags_ext_1')?.toString()).toBe(
      CHATWOOT_DEFAULT_FEATURE_FLAGS_EXT_1,
    );
  });
});
