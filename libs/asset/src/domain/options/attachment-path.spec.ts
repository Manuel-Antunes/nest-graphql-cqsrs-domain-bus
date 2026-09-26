import { Attachment } from '../asset/attachment';
import { AttachmentContextRegistry } from '../context/attachment-context-registry';
import type {
  AttachmentDefaults,
  ResolvedAttachmentOptions,
} from './attachment-options';
import { AttachmentPath } from './attachment-path';

const defaults: AttachmentDefaults = {
  folder: 'uploads',
  rename: true,
  preComputeUrl: false,
  meta: false,
  keepSource: false,
};

const options = (
  overrides: Partial<ResolvedAttachmentOptions>,
): ResolvedAttachmentOptions => ({ ...defaults, variants: [], ...overrides });

const pending = () =>
  Attachment.fromDisk('tmp/x', {
    size: 1,
    mimeType: 'image/png',
    originalName: 'Férias 2026.PNG',
  });

describe('AttachmentPath', () => {
  afterEach(() => AttachmentContextRegistry.reset());

  it('falls back to the module defaults for every option a column leaves out', async () => {
    expect(
      await AttachmentPath.resolve({ variants: ['thumbnail'] }, defaults, {
        path: ['cover'],
      }),
    ).toEqual({ ...defaults, variants: ['thumbnail'] });
  });

  it('evaluates strategies against the entity, the property and the ambient context', async () => {
    AttachmentContextRegistry.use(() => ({ tenantId: 'acme' }));

    const resolved = await AttachmentPath.resolve(
      {
        disk: async (post: { secret: boolean } | undefined) =>
          post?.secret ? 'private' : 'public',
        folder: (_post, { ctx, path }) => `${ctx.tenantId}/${path.join('.')}`,
        rename: (_post, { originalName }) => `copy-of-${originalName}`,
      },
      defaults,
      {
        entity: { secret: true },
        path: ['documents', 'file'],
        originalName: 'a.pdf',
      },
    );

    expect(resolved).toMatchObject({
      disk: 'private',
      folder: 'acme/documents.file',
      rename: 'copy-of-a.pdf',
    });
  });

  it('names a file by a random UUID with its extension, unless renaming is off', () => {
    expect(AttachmentPath.of(pending(), options({}))).toMatch(
      /^uploads\/[0-9a-f-]{36}\.png$/,
    );
    expect(
      AttachmentPath.of(
        pending(),
        options({ rename: false, folder: undefined }),
      ),
    ).toBe('Férias 2026.PNG');
  });

  it('replaces :segments by the entity’s values, slugged, and leaves unknown ones', () => {
    const entity = {
      title: 'Olá, Mundo!',
      id: { value: 'Abc-123' },
      count: 7,
    };

    expect(
      AttachmentPath.of(
        pending(),
        options({
          folder: 'posts/:title/:id/:count/:missing',
          rename: 'cover-:id.png',
        }),
        entity,
      ),
    ).toBe('posts/ola-mundo/abc-123/7/:missing/cover-abc-123.png');
  });

  it('lays variants out beside their attachment, under a base path, or without its folder', () => {
    const attachment = Attachment.restore({
      path: 'avatars/me.jpg',
      size: 1,
      extname: 'jpg',
      mimeType: 'image/jpeg',
    });

    expect(AttachmentPath.variantFolder(attachment)).toBe(
      'avatars/variants/me.jpg',
    );
    expect(
      AttachmentPath.variantFolder(attachment, { basePath: 'variants' }),
    ).toBe('variants/avatars/me.jpg');
    expect(
      AttachmentPath.variantFolder(attachment, { ignoreFolder: true }),
    ).toBe('me.jpg');
    expect(
      AttachmentPath.variantFolder(attachment, {
        basePath: 'all',
        ignoreFolder: true,
      }),
    ).toBe('all/me.jpg');
  });
});
