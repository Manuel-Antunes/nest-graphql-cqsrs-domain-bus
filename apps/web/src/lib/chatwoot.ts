export class Chatwoot {
  static readonly SUPPORT_PATH = '/atendimento';
  static readonly DASHBOARD_PATH = '/app';
  static readonly PLATFORM_NAVIGATE = 'PLATFORM_NAVIGATE';

  static platformPathOf(message: unknown): string | null {
    if (!message || typeof message !== 'object') return null;
    const { type, path } = message as { type?: unknown; path?: unknown };
    if (type !== Chatwoot.PLATFORM_NAVIGATE || typeof path !== 'string') {
      return null;
    }
    return /^\/(?![/\\])/.test(path) ? path : null;
  }

  static originOf(url: string): string {
    return new URL(url).origin;
  }

  static frameUrlOf(url: string, path: string): string {
    return `${url.replace(/\/$/, '')}${path || Chatwoot.DASHBOARD_PATH}`;
  }

  static supportPathOf(dashboardPath: string): string {
    return `${Chatwoot.SUPPORT_PATH}${dashboardPath === '/' ? '' : dashboardPath}`;
  }
}
