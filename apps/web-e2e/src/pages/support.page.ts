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
