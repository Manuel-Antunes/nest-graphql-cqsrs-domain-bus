import type { Locator, Page } from '@playwright/test';

import { PostsApp } from '../components/posts-app.component';
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

  get conversations(): Locator {
    return this.page.getByRole('navigation', {
      name: 'Conversations with Theo',
    });
  }

  get conversationTitles(): Locator {
    return this.conversations
      .getByRole('button')
      .filter({ hasNotText: 'New conversation' })
      .locator('[data-slot="item-title"]');
  }

  get noConversationYet(): Locator {
    return this.conversations.getByText(
      'Your conversations with Theo will be listed here.',
    );
  }

  async startNewConversation(): Promise<void> {
    await this.conversations
      .getByRole('button', { name: 'New conversation' })
      .click();
  }

  async reopenConversation(title: string): Promise<void> {
    await this.conversations.getByRole('button', { name: title }).click();
  }

  async connectStatusOf(threadId: string): Promise<number> {
    const response = await this.page.request.post(
      '/api/copilotkit/agent/theo/connect',
      {
        data: {
          threadId,
          runId: 'replay',
          messages: [],
          state: {},
          tools: [],
          context: [],
          forwardedProps: {},
        },
      },
    );
    return response.status();
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

  heard(text: string): Locator {
    return this.conversation.getByText(text);
  }

  postsAppOn(tool: string): PostsApp {
    return new PostsApp(
      this.page,
      this.conversation.getByRole('region', { name: `${tool} app` }),
    );
  }
}
