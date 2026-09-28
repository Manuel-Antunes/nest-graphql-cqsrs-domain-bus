import { Attachment } from '@nestposts/asset/domain/asset/attachment';

import { AvatarImages } from '../avatar/avatar-images';
import { UserDatabaseHooks } from './user-database.hooks';

describe('UserDatabaseHooks', () => {
  const hooks = new UserDatabaseHooks(new AvatarImages());

  const creating = (user: { email: string; name: string; image?: unknown }) =>
    hooks.beforeCreate({ ...user, id: 'cred_1', emailVerified: false });

  it('names a user created without a name after the local part of their email', async () => {
    await expect(
      creating({ email: 'ana.silva@example.com', name: '' }),
    ).resolves.toEqual({
      data: expect.objectContaining({
        email: 'ana.silva@example.com',
        name: 'ana.silva',
      }),
    });
  });

  it('keeps the name a user was created with', async () => {
    await expect(
      creating({ email: 'ana.silva@example.com', name: '  Ana  ' }),
    ).resolves.toEqual({
      data: expect.objectContaining({ name: 'Ana' }),
    });
  });

  it('names the user and keeps the avatar in the one answer it gives', async () => {
    const avatar = Attachment.fromDisk('tmp/anonymous/1-x', {
      size: 4,
      mimeType: 'image/png',
    });

    const { data } = await creating({
      email: 'ana.silva@example.com',
      name: '',
      image: avatar,
    });

    expect(data).toMatchObject({ name: 'ana.silva', image: avatar });
  });

  it('leaves an update that writes no image as it is', async () => {
    await expect(hooks.beforeUpdate({ name: 'Renamed' })).resolves.toEqual({
      data: { name: 'Renamed' },
    });
  });

  it('refuses an update whose image points somewhere instead of being uploaded', async () => {
    await expect(
      hooks.beforeUpdate({ image: 'https://example.com/me.png' }),
    ).rejects.toMatchObject({ body: { code: 'AVATAR_NOT_UPLOADED' } });
  });
});
