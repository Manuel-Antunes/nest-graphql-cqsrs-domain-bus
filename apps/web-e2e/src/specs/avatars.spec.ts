import { expect, test } from '../fixtures/test';
import { Storage } from '../infrastructure/storage/storage';
import type { Account } from '../model/account';
import { EmailSubject } from '../model/email';
import { Png } from '../model/post';
import { Unique } from '../support/unique';
import { Registration } from '../workflows/auth/registration.workflow';

const RED_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC',
  'base64',
);

const BLUE_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQCLgDAAH4AVXSujU3AAAAAElFTkSuQmCC',
  'base64',
);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const AVATAR_KEY = new RegExp(`^${Storage.AVATARS_PREFIX}[0-9a-f-]{36}\\.png$`);

test.describe('a user avatar is an attachment', () => {
  test('signing up with an avatar keeps it in the bucket, and the header shows it once signed in', async ({
    page,
    app,
    mailbox,
    credentialRecords,
    storage,
  }) => {
    const email = Unique.email('portrait');

    await app.signUp.open();
    await app.signUp.submit({
      name: 'Portrait',
      email,
      password: Registration.PASSWORD,
      avatar: Png.named('portrait.png', RED_PIXEL),
    });
    await expect(page).toHaveURL(/\/auth\/verify-email/);

    const avatar = await credentialRecords.avatarOf(email);
    expect(avatar).toMatchObject({
      disk: 'public',
      extname: 'png',
      mimeType: 'image/png',
    });
    expect(avatar?.path).toMatch(AVATAR_KEY);
    const stored = await storage.read(avatar?.path as string);
    expect(stored.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
    expect(stored.length).toBe(avatar?.size);
    expect(await storage.keys(Storage.STAGING_PREFIX)).toEqual([]);

    const mail = await mailbox.waitFor(email, EmailSubject.VERIFY_EMAIL);
    await app.visit(mail.link('/api/auth/verify-email'));

    const shown = app.header.avatar('Portrait');
    await expect(shown).toHaveAttribute('src', new RegExp(`${avatar?.path}$`));
    const served = await app.fetch((await shown.getAttribute('src')) as string);
    expect(served.status()).toBe(200);
    expect(await served.body()).toEqual(stored);
  });

  test.describe
    .serial('changing the avatar in the account settings', () => {
      let account: Account;
      let firstKey: string;

      test('uploading an avatar keeps it in the bucket, and the header shows it', async ({
        app,
        registration,
        authentication,
        credentialRecords,
        storage,
      }) => {
        account = await registration.freshAccount('Settings');
        await authentication.signIn(account);
        await app.accountSettings.open();
        await expect(app.header.avatar(account.name)).toHaveCount(0);

        await app.accountSettings.changeAvatar(
          Png.named('first.png', RED_PIXEL),
        );

        await expect(app.accountSettings.avatarChanged).toBeVisible();
        const avatar = await credentialRecords.avatarOf(account.email);
        firstKey = avatar?.path as string;
        expect(firstKey).toMatch(AVATAR_KEY);
        expect(
          (await storage.read(firstKey)).subarray(0, PNG_SIGNATURE.length),
        ).toEqual(PNG_SIGNATURE);
        expect(await storage.keys(Storage.STAGING_PREFIX)).toEqual([]);
        await expect(app.header.avatar(account.name)).toHaveAttribute(
          'src',
          new RegExp(`${firstKey}$`),
        );
      });

      test('replacing it keeps the new one and deletes the old one', async ({
        app,
        authentication,
        credentialRecords,
        storage,
      }) => {
        await authentication.signIn(account);
        await app.accountSettings.open();

        await app.accountSettings.changeAvatar(
          Png.named('second.png', BLUE_PIXEL),
        );

        await expect(app.accountSettings.avatarChanged).toBeVisible();
        const secondKey = (await credentialRecords.avatarOf(account.email))
          ?.path as string;
        expect(secondKey).toMatch(AVATAR_KEY);
        expect(secondKey).not.toBe(firstKey);
        expect(await storage.exists(secondKey)).toBe(true);
        await expect.poll(() => storage.exists(firstKey)).toBe(false);
        expect(await storage.keys(Storage.STAGING_PREFIX)).toEqual([]);
        await expect(app.header.avatar(account.name)).toHaveAttribute(
          'src',
          new RegExp(`${secondKey}$`),
        );
        firstKey = secondKey;
      });

      test('deleting it leaves no avatar, and no file', async ({
        app,
        authentication,
        credentialRecords,
        storage,
      }) => {
        await authentication.signIn(account);
        await app.accountSettings.open();

        await app.accountSettings.deleteAvatar();

        await expect(app.accountSettings.avatarDeleted).toBeVisible();
        expect(await credentialRecords.avatarOf(account.email)).toBeNull();
        await expect.poll(() => storage.exists(firstKey)).toBe(false);
        await expect(app.header.avatar(account.name)).toHaveCount(0);
      });
    });
});
