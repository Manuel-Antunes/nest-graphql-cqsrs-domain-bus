import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { PostDraft } from '../../model/post';
import { WebPage } from '../web-page';

export class NewPostPage extends WebPage {
  private static readonly PERMISSION_TIMEOUT_MS = 60_000;

  constructor(page: Page) {
    super(page, '/posts/new');
  }

  get titleField(): Locator {
    return this.page.getByLabel('Título');
  }

  get publishButton(): Locator {
    return this.page.getByRole('button', { name: 'Publicar' });
  }

  get signInPrompt(): Locator {
    return this.page.getByText('Entre para escrever');
  }

  get loginLink(): Locator {
    return this.page.getByRole('link', { name: 'Ir para o login' });
  }

  get notAnAuthor(): Locator {
    return this.page.getByText('Esta conta não tem a role author');
  }

  answeredVersion(version: number): Locator {
    return this.page.getByText(`Resposta da mutation — versão ${version}`);
  }

  async publish({ title, content, attachment }: PostDraft): Promise<string> {
    await this.titleField.fill(title);
    await this.page.getByLabel('Conteúdo').fill(content);
    if (attachment) {
      await this.page.getByLabel('Anexo').setInputFiles(attachment);
    }
    await this.publishButton.click();
    const href = await this.page
      .getByRole('link', { name: 'Abrir o post' })
      .getAttribute('href');
    return href?.split('/').pop() as string;
  }

  async untilAuthorized(): Promise<void> {
    await this.reopenUntil(
      async () => {
        await expect(this.titleField).toBeVisible({ timeout: 5_000 });
      },
      { timeout: NewPostPage.PERMISSION_TIMEOUT_MS },
    );
  }

  async untilRefused(): Promise<void> {
    await this.reopenUntil(
      async () => {
        await expect(this.notAnAuthor).toBeVisible({ timeout: 5_000 });
      },
      { timeout: NewPostPage.PERMISSION_TIMEOUT_MS },
    );
  }
}
