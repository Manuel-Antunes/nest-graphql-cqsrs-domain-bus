export interface AttachmentScopeConfig {
  user_id?: unknown;
  thread_id?: unknown;
  attachment_scope?: unknown;
  [key: string]: unknown;
}

export class AttachmentScope {
  static readonly LEGACY_ROOT = 'tmp/file-analysis';

  static rootOf(configurable?: AttachmentScopeConfig | null): string {
    const userId = configurable?.user_id;
    const threadId = configurable?.thread_id;
    const scope = configurable?.attachment_scope;
    if (
      !AttachmentScope.isFilled(userId) ||
      !AttachmentScope.isFilled(threadId)
    ) {
      return AttachmentScope.LEGACY_ROOT;
    }
    const base = AttachmentScope.isFilled(scope)
      ? `agents/${AttachmentScope.segment(scope)}`
      : 'agents';
    return `${base}/${AttachmentScope.segment(userId)}/file-analysis/${AttachmentScope.segment(threadId)}`;
  }

  private static isFilled(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  }

  private static segment(value: string): string {
    return value.replace(/[/\\]+/g, '_').replace(/\.\.+/g, '_');
  }
}
