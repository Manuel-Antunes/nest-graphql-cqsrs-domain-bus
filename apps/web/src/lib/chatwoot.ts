export class Chatwoot {
  static readonly SUPPORT_PATH = '/atendimento';

  static originOf(url: string): string {
    return new URL(url).origin;
  }

  static frameUrlOf(url: string, path: string): string {
    return `${url.replace(/\/$/, '')}${path}`;
  }

  static supportPathOf(dashboardPath: string): string {
    return `${Chatwoot.SUPPORT_PATH}${dashboardPath === '/' ? '' : dashboardPath}`;
  }
}
