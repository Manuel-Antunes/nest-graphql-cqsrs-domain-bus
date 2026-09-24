import { expect, test } from '../fixtures/test';
import { until } from '../support/posts-api';
import { ATTACHMENTS_PREFIX, STAGING_PREFIX } from '../support/storage';

const RED_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC',
  'base64',
);

const BLUE_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQCLgDAAH4AVXSujU3AAAAAElFTkSuQmCC',
  'base64',
);

const aPng = (name: string, buffer: Buffer) => ({
  name,
  mimeType: 'image/png',
  buffer,
});

const ATTACHED_KEY = new RegExp(`^${ATTACHMENTS_PREFIX}[0-9a-f-]{36}\\.png$`);

test.describe
  .serial('a post carries its file from the browser to the bucket', () => {
    let postId: string;
    let firstKey: string;
    let secondKey: string;

    test('creating a post with a file keeps the file under the post, and nothing in staging', async ({
      page,
      accounts,
      signIn,
      postsStore,
      storage,
    }) => {
      await signIn(accounts.author);
      await page.goto('/posts/new');

      await page.getByLabel('Título').fill('Post com anexo');
      await page.getByLabel('Conteúdo').fill('um pixel vermelho');
      await page.getByLabel('Anexo').setInputFiles(aPng('red.png', RED_PIXEL));
      await page.getByRole('button', { name: 'Publicar' }).click();

      await expect(
        page.getByText('Resposta da mutation — versão 1'),
      ).toBeVisible();
      const href = await page
        .getByRole('link', { name: 'Abrir o post' })
        .getAttribute('href');
      postId = href?.split('/').pop() as string;

      const stored = await postsStore.attachmentOf(postId);
      expect(stored?.asset).toMatchObject({
        extname: 'png',
        mimeType: 'image/png',
        size: RED_PIXEL.length,
        persisted: true,
      });
      firstKey = stored?.asset?.name as string;
      expect(firstKey).toMatch(ATTACHED_KEY);
      expect(await storage.read(firstKey)).toEqual(RED_PIXEL);
      expect(await storage.keys(STAGING_PREFIX)).toEqual([]);

      expect(
        await until(
          async () => (await postsStore.post(postId))?.version === 2,
          30_000,
        ),
        'the saga completes the post before anything else touches it',
      ).toBe(true);
    });

    test('the post page shows the file, served from the bucket', async ({
      page,
    }) => {
      await page.goto(`/posts/${postId}`);

      const image = page.getByRole('img', { name: 'Anexo do post' });
      await expect(image).toBeVisible();
      const src = (await image.getAttribute('src')) as string;
      expect(src).toContain(firstKey);

      const served = await page.request.get(src);
      expect(served.status()).toBe(200);
      expect(await served.body()).toEqual(RED_PIXEL);
    });

    test('replacing the file keeps the new one and deletes the old one', async ({
      page,
      accounts,
      signIn,
      postsStore,
      storage,
    }) => {
      await signIn(accounts.author);
      await page.goto(`/posts/${postId}`);

      await page
        .getByLabel('Novo anexo')
        .setInputFiles(aPng('blue.png', BLUE_PIXEL));
      await page
        .getByRole('button', { name: 'Enviar o que foi preenchido' })
        .click();
      await expect(page.getByText('updatePost aceito')).toBeVisible();

      const stored = await postsStore.attachmentOf(postId);
      secondKey = stored?.asset?.name as string;
      expect(secondKey).toMatch(ATTACHED_KEY);
      expect(secondKey).not.toBe(firstKey);
      expect(await storage.read(secondKey)).toEqual(BLUE_PIXEL);
      await expect.poll(() => storage.exists(firstKey)).toBe(false);
      expect(await storage.keys(STAGING_PREFIX)).toEqual([]);

      await expect(
        page.getByRole('img', { name: 'Anexo do post' }),
      ).toHaveAttribute('src', new RegExp(secondKey));
    });

    test('deleting the post deletes its file', async ({
      page,
      accounts,
      signIn,
      postsStore,
      storage,
    }) => {
      await signIn(accounts.author);
      await page.goto(`/posts/${postId}`);

      await page.getByRole('button', { name: 'Excluir post' }).click();
      await expect(page).toHaveURL(/\/feed$/);

      const stored = await postsStore.attachmentOf(postId);
      expect(
        stored?.deleted_at,
        'the row stays, deleted logically',
      ).not.toBeNull();
      expect(stored?.asset).toBeNull();
      await expect.poll(() => storage.exists(secondKey)).toBe(false);
      expect(await storage.keys(ATTACHMENTS_PREFIX)).not.toContain(secondKey);
    });
  });
