import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { InMemoryDisk, Storage, StorageModule } from '@nestjs/storage';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Attachment } from '@nestposts/asset/domain/asset/attachment';
import type { AssetUpload } from '@nestposts/asset/domain/asset/schemas/asset-upload.schema';
import { UploadArea } from '@nestposts/asset/domain/asset/upload-area';
import { AttachmentModule } from '@nestposts/asset/infrastructure/attachment.module';
import {
  DatabaseModule,
  inRequestContext,
  MikroORM,
} from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';

import { AuthUser } from '../../../domain/auth/auth-user.entity';
import { AuthInfrastructureModule } from '../../auth-infrastructure.module';
import { authEntities } from '../../persistence/auth-entities';
import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';
import { AvatarImages } from './avatar-images';

const PUBLIC_URL = 'http://files.test/public';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('a user image is an attachment', () => {
  let moduleRef: TestingModule;
  let orm: AnyMikroORM;
  let disk: InMemoryDisk;
  let auth: BetterAuth;
  let pictures: Server;
  let picturesUrl: string;
  let people = 0;

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(orm.em, work);

  const storedUser = (email: string): Promise<AuthUser> =>
    inContext(
      () =>
        orm.em
          .fork()
          .findOneOrFail(AuthUser, { email } as never) as Promise<AuthUser>,
    );

  const uploadedBy = async (
    uploader: string,
    name = 'me.png',
    mimeType = 'image/png',
  ): Promise<AssetUpload> => {
    const key = UploadArea.keyFor(uploader);
    await disk.put(key, PNG, { contentType: mimeType });
    return {
      name: key,
      size: PNG.length,
      extname: name.split('.').pop() ?? 'bin',
      mimeType,
    };
  };

  const signUp = async (image?: AssetUpload) => {
    people += 1;
    const email = `person-${people}@example.com`;
    const { headers, response } = await inContext(() =>
      auth.api.signUpEmail({
        body: {
          name: 'Person',
          email,
          password: 'a-long-password',
          image: image && JSON.stringify(image),
        },
        returnHeaders: true,
      }),
    );
    const cookie = headers
      .getSetCookie()
      .map((setCookie: string) => setCookie.split(';')[0])
      .join('; ');
    return {
      email,
      id: response.user.id,
      user: response.user,
      session: new Headers({ cookie }),
    };
  };

  const updateImage = (session: Headers, image: AssetUpload | string | null) =>
    inContext(() =>
      auth.api.updateUser({
        headers: session,
        body: {
          image:
            image === null || typeof image === 'string'
              ? image
              : JSON.stringify(image),
        },
      }),
    );

  beforeAll(async () => {
    vi.stubEnv('AUTH_URL', 'http://localhost:3000');
    vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
    vi.stubEnv('AUTH_RATE_LIMIT', 'false');
    moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({
          ...testDatabaseConfig({ entities: authEntities }, 'auth_avatar'),
          exclusive: true,
        }),
        TestSchemaModule.forRoot(),
        StorageModule.forRoot({
          default: 'public',
          disks: { public: new InMemoryDisk({ publicUrl: PUBLIC_URL }) },
        }),
        AttachmentModule.forRoot({}),
        AuthInfrastructureModule.forRoot({ routes: false, guard: false }),
      ],
    }).compile();
    await moduleRef.init();

    orm = moduleRef.get(MikroORM);
    disk = moduleRef.get(Storage).disk('public') as InMemoryDisk;
    auth = moduleRef.get(BETTER_AUTH);

    pictures = createServer((request, response) => {
      if (request.url === '/picture.png') {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(PNG);
        return;
      }
      if (request.url === '/page.html') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<html></html>');
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => pictures.listen(0, resolve));
    picturesUrl = `http://127.0.0.1:${(pictures.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => pictures?.close(resolve));
    await moduleRef?.close();
    vi.unstubAllEnvs();
  });

  it('a sign-up carrying what was uploaded keeps it as the avatar, and answers its URL', async () => {
    const upload = await uploadedBy(UploadArea.ANONYMOUS, 'portrait.png');

    const { email, user } = await signUp(upload);
    const stored = await storedUser(email);

    expect(stored.image).toBeInstanceOf(Attachment);
    expect(stored.image?.path).toMatch(/^avatars\/.+\.png$/);
    expect(stored.image?.mimeType).toBe('image/png');
    expect(user.image).toBe(`${PUBLIC_URL}/${stored.image?.path}`);
    await expect(disk.exists(stored.image?.path ?? '')).resolves.toBe(true);
    await expect(disk.exists(upload.name)).resolves.toBe(false);
  });

  it('a sign-up without an image leaves the user without an avatar', async () => {
    const { email, user } = await signUp();

    expect(user.image).toBeNull();
    expect((await storedUser(email)).image).toBeNull();
  });

  it('a sign-up takes only what nobody signed in uploaded', async () => {
    const somebodys = await uploadedBy('somebody');

    await expect(signUp(somebodys)).rejects.toMatchObject({
      body: { code: 'AVATAR_NOT_UPLOADED' },
    });
    await expect(disk.exists(somebodys.name)).resolves.toBe(true);
  });

  it('the session reads the avatar back as its URL', async () => {
    const { session } = await signUp(await uploadedBy(UploadArea.ANONYMOUS));

    const current = await inContext(() =>
      auth.api.getSession({ headers: session }),
    );

    expect(current?.user.image).toMatch(
      new RegExp(`^${PUBLIC_URL}/avatars/.+\\.png$`),
    );
  });

  it('update-user replaces the avatar with what the user uploaded, and deletes the one it replaces', async () => {
    const { email, id, session } = await signUp(
      await uploadedBy(UploadArea.ANONYMOUS),
    );
    const before = (await storedUser(email)).image?.path ?? '';

    const upload = await uploadedBy(id, 'new.webp', 'image/webp');
    await updateImage(session, upload);
    const after = (await storedUser(email)).image;

    expect(after?.path).toMatch(/^avatars\/.+\.webp$/);
    expect(after?.path).not.toBe(before);
    await expect(disk.exists(before)).resolves.toBe(false);
    await expect(disk.exists(after?.path ?? '')).resolves.toBe(true);
    await expect(disk.exists(upload.name)).resolves.toBe(false);
  });

  it('update-user takes nobody else’s upload', async () => {
    const { session } = await signUp();

    for (const upload of [
      await uploadedBy('somebody'),
      await uploadedBy(UploadArea.ANONYMOUS),
    ]) {
      await expect(updateImage(session, upload)).rejects.toMatchObject({
        body: { code: 'AVATAR_NOT_UPLOADED' },
      });
      await expect(disk.exists(upload.name)).resolves.toBe(true);
    }
  });

  it('refuses an upload that is not an image', async () => {
    const { id, session } = await signUp();

    await expect(
      updateImage(session, await uploadedBy(id, 'page.svg', 'image/svg+xml')),
    ).rejects.toMatchObject({ body: { code: 'AVATAR_NOT_UPLOADED' } });
  });

  it('changing only the name keeps the avatar', async () => {
    const { email, session } = await signUp(
      await uploadedBy(UploadArea.ANONYMOUS),
    );
    const before = (await storedUser(email)).image?.path;

    await inContext(() =>
      auth.api.updateUser({ headers: session, body: { name: 'Renamed' } }),
    );

    expect((await storedUser(email)).image?.path).toBe(before);
  });

  it('clearing the image deletes the avatar', async () => {
    const { email, session } = await signUp(
      await uploadedBy(UploadArea.ANONYMOUS),
    );
    const before = (await storedUser(email)).image?.path ?? '';

    await updateImage(session, null);

    expect((await storedUser(email)).image).toBeNull();
    await expect(disk.exists(before)).resolves.toBe(false);
  });

  it('refuses an image that points somewhere instead of being uploaded', async () => {
    const { session } = await signUp();

    await expect(
      updateImage(session, `${picturesUrl}/picture.png`),
    ).rejects.toMatchObject({ body: { code: 'AVATAR_NOT_UPLOADED' } });
  });

  it('a user created without a name is still named after the email, by the same hook', async () => {
    const context = await auth.$context;

    await inContext(() =>
      context.internalAdapter.createUser(
        { name: '', email: 'nameless@example.com', emailVerified: true },
        { method: 'magic-link' },
      ),
    );

    expect((await storedUser('nameless@example.com')).name.value).toBe(
      'nameless',
    );
  });

  describe("a social provider's picture", () => {
    const fromProvider = { path: '/callback/:id' };
    const images = () => moduleRef.get(AvatarImages);

    it('is downloaded and kept as an attachment of ours', async () => {
      const { image } = await images().written(
        { image: `${picturesUrl}/picture.png` },
        fromProvider,
      );
      const context = await auth.$context;
      const user = await inContext(() =>
        context.internalAdapter.createUser(
          {
            name: 'Google',
            email: 'google@example.com',
            emailVerified: true,
            image: image as unknown as string,
          },
          { method: 'oauth', oauth: { providerId: 'google' } },
        ),
      );
      const stored = await storedUser('google@example.com');

      expect(image).toBeInstanceOf(Attachment);
      expect(stored.image?.path).toMatch(/^avatars\/.+\.png$/);
      expect(user.image).toBe(`${PUBLIC_URL}/${stored.image?.path}`);
    });

    it('that is not an image leaves the user without an avatar', async () => {
      await expect(
        images().written({ image: `${picturesUrl}/page.html` }, fromProvider),
      ).resolves.toEqual({ image: null });
    });

    it('that cannot be downloaded leaves the user without an avatar', async () => {
      await expect(
        images().written({ image: `${picturesUrl}/missing.png` }, fromProvider),
      ).resolves.toEqual({ image: null });
    });
  });

  describe('a process that stores no attachments', () => {
    const images = new AvatarImages();

    it('takes no upload', async () => {
      await expect(
        images.written({
          image: JSON.stringify(await uploadedBy(UploadArea.ANONYMOUS)),
        }),
      ).rejects.toMatchObject({ body: { code: 'AVATARS_NOT_STORED' } });
    });

    it("keeps no provider's picture", async () => {
      await expect(
        images.written(
          { image: `${picturesUrl}/picture.png` },
          { path: '/callback/:id' },
        ),
      ).resolves.toEqual({ image: null });
    });
  });
});
