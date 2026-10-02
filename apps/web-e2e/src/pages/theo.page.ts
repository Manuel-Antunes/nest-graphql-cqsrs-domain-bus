import type { Locator, Page } from '@playwright/test';

import { WebPage } from './web-page';

export class TheoPage extends WebPage {
  constructor(page: Page) {
    super(page, '/theo');
  }

  get signInPrompt(): Locator {
    return this.page.getByText('Sign in to talk to Theo');
  }

  get conversation(): Locator {
    return this.page.getByRole('log', { name: 'Conversation with Theo' });
  }

  async ask(text: string): Promise<void> {
    await this.page
      .getByRole('textbox', { name: 'Message to Theo' })
      .fill(text);
    await this.page
      .getByRole('textbox', { name: 'Message to Theo' })
      .press('Enter');
  }

  async runStatusWithoutConversation(): Promise<number> {
    const response = await this.page.request.post(
      '/api/copilotkit/agent/theo/run',
      { data: { threadId: 'thread', runId: 'run', messages: [] } },
    );
    return response.status();
  }

  delegationTo(agent: string): Locator {
    return this.conversation.getByRole('region', {
      name: `Delegation to ${agent}`,
    });
  }

  said(text: string): Locator {
    return this.conversation.getByText(text, { exact: true });
  }
}
