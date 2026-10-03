import type { FrameLocator, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { PostPage } from '../pages/posts/post.page';

/**
 * **The posts MCP App, inside the conversation that opened it.** CopilotKit's MCP Apps host draws it
 * in two iframes — its sandbox, and the app's own document inside it — and what is here is what a
 * person sees and clicks in the second: the picker, the editor and the draft's preview.
 */
export class PostsApp {
  private readonly frame: FrameLocator;

  constructor(
    private readonly page: Page,
    readonly region: Locator,
  ) {
    this.frame = region
      .frameLocator('[data-testid="mcp-app-iframe"]')
      .frameLocator('iframe');
  }

  get picker(): Locator {
    return this.frame.getByRole('region', { name: 'Your posts' });
  }

  postToEdit(title: string): Locator {
    return this.picker.getByRole('button', { name: title });
  }

  get titleField(): Locator {
    return this.frame.getByLabel('Title');
  }

  get saved(): Locator {
    return this.frame.getByRole('alert').filter({ hasText: 'Saved' });
  }

  get preview(): Locator {
    return this.frame.getByRole('region', { name: 'Post preview' });
  }

  get published(): Locator {
    return this.frame.getByRole('alert').filter({ hasText: 'Published' });
  }

  get notPublished(): Locator {
    return this.frame
      .getByRole('alert')
      .filter({ hasText: 'The post was not published' });
  }

  get discarded(): Locator {
    return this.frame.getByRole('alert').filter({ hasText: 'Discarded' });
  }

  async choose(title: string): Promise<void> {
    await this.postToEdit(title).click();
    await expect(this.titleField).toHaveValue(title);
  }

  async retitle(title: string): Promise<void> {
    await this.titleField.fill(title);
    await this.frame.getByRole('button', { name: 'Save changes' }).click();
    await expect(this.saved).toBeVisible();
  }

  async publish(): Promise<void> {
    await this.preview.getByRole('button', { name: 'Publish' }).click();
  }

  async discard(): Promise<void> {
    await this.preview.getByRole('button', { name: 'Discard' }).click();
  }

  async openOnTheBlog(postId: string): Promise<PostPage> {
    const [tab] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.frame.getByRole('button', { name: 'Open on the blog' }).click(),
    ]);
    await tab.waitForLoadState();
    return new PostPage(tab, postId);
  }
}
