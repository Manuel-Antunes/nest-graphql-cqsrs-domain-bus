import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { AttachmentFile } from '../../model/post';
import { WebPage } from '../web-page';

export class PostPage extends WebPage {
  constructor(
    page: Page,
    readonly postId: string,
  ) {
    super(page, `/posts/${postId}`);
  }

  get notFound(): Locator {
    return this.page.locator('main').getByText('Post não encontrado');
  }

  get attachment(): Locator {
    return this.page.getByRole('img', { name: 'Anexo do post' });
  }

  tag(name: string): Locator {
    return this.page.getByText(name).first();
  }

  text(text: string): Locator {
    return this.page.locator('main').getByText(text).first();
  }

  async attachmentSource(): Promise<string> {
    return (await this.attachment.getAttribute('src')) as string;
  }

  async replaceAttachment(file: AttachmentFile): Promise<void> {
    await this.page.getByLabel('Novo anexo').setInputFiles(file);
    await this.page
      .getByRole('button', { name: 'Enviar o que foi preenchido' })
      .click();
    await expect(this.page.getByText('updatePost aceito')).toBeVisible();
  }

  async delete(): Promise<void> {
    await this.page.getByRole('button', { name: 'Excluir post' }).click();
    await expect(this.page).toHaveURL(/\/feed$/);
  }
}
