import type { FrameLocator, Locator, Page } from '@playwright/test';

import { WebPage } from './web-page';

/** `/atendimento`: Chatwoot's dashboard, embedded, under the platform's session. */
export class SupportPage extends WebPage {
  constructor(page: Page) {
    super(page, '/atendimento');
  }

  get dashboard(): Locator {
    return this.page.getByTitle('Chatwoot');
  }

  get frame(): FrameLocator {
    return this.page.frameLocator('iframe[title="Chatwoot"]');
  }

  get signInPrompt(): Locator {
    return this.page.getByText('Sign in to open support');
  }

  /** Cmd+K, which the dashboard's shell mounts around every page. */
  get commandBar(): Locator {
    return this.frame.locator('ninja-keys');
  }

  /** What the dashboard offers someone who is in no organization — and so has no account. */
  get createOrganization(): Locator {
    return this.frame.getByRole('button', { name: 'Criar organização' });
  }

  /** The calls page of an account with no voice inbox yet. */
  get callsSetup(): Locator {
    return this.frame.getByText('Faça e receba chamadas em um só lugar');
  }

  get setUpVoiceChannel(): Locator {
    return this.frame.getByRole('button', { name: 'Configurar canal de voz' });
  }

  async openAt(dashboardPath: string): Promise<void> {
    await this.page.goto(`${this.path}${dashboardPath}`);
  }

  /** The dashboard's own address, inside the frame — where Chatwoot actually is. */
  async framedPath(): Promise<string> {
    const frame = await (await this.dashboard.elementHandle())?.contentFrame();
    const url = frame?.url();
    return url && url !== 'about:blank' ? new URL(url).pathname : '';
  }
}
