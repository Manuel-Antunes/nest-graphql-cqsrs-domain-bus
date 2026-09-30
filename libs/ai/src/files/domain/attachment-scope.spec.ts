import { AttachmentScope } from './attachment-scope';

describe('AttachmentScope.rootOf', () => {
  const configurable = {
    user_id: 'user-1',
    thread_id: 'thread-1',
    attachment_scope: 'octopus',
  };

  it('scopes by agent when attachment_scope is present', () => {
    expect(AttachmentScope.rootOf(configurable)).toBe(
      'agents/octopus/user-1/file-analysis/thread-1',
    );
  });

  it('resolves IDENTICALLY for writer and reader (same configurable in, same root out)', () => {
    const writerRoot = AttachmentScope.rootOf(configurable);
    const readerRoot = AttachmentScope.rootOf(configurable);
    expect(writerRoot).toBe(readerRoot);
  });

  it('falls back to an unscoped — but still consistent — root without attachment_scope', () => {
    const root = AttachmentScope.rootOf({
      user_id: 'user-1',
      thread_id: 'thread-1',
    });
    expect(root).toBe('agents/user-1/file-analysis/thread-1');
  });

  it('falls back to the legacy flat root when the ids are missing', () => {
    expect(AttachmentScope.rootOf({ thread_id: 'thread-1' })).toBe(
      AttachmentScope.LEGACY_ROOT,
    );
    expect(AttachmentScope.rootOf(undefined)).toBe(AttachmentScope.LEGACY_ROOT);
  });

  it('sanitizes segments so a hostile id cannot escape the root', () => {
    const root = AttachmentScope.rootOf({
      user_id: '../../etc',
      thread_id: 'a/b',
      attachment_scope: 'x/y',
    });

    expect(root).not.toContain('..');
    expect(root.split('/')).toHaveLength(5);
    expect(root.startsWith('agents/x_y/')).toBe(true);
    expect(root.endsWith('/file-analysis/a_b')).toBe(true);
  });
});
