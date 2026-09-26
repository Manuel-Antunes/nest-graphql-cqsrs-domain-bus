import { AttachmentKeys } from './attachment-keys';

const payload = {
  entity: 'Post',
  schema: 'tenant_acme',
  where: { id: '0b8f5e36-2c2f-4b56-9d42-2a3f0b7e8c11' },
  path: ['cover'],
  key: 'posts/covers/a.png',
};

describe('AttachmentKeys', () => {
  it('opens what it sealed, and nothing it did not', () => {
    const keys = new AttachmentKeys('secret');
    const keyId = keys.seal(payload) as string;

    expect(keys.open(keyId)).toEqual(payload);
    expect(new AttachmentKeys('another secret').open(keyId)).toBeUndefined();
    expect(keys.open('garbage')).toBeUndefined();
  });

  it('refuses a key id that was altered', () => {
    const keys = new AttachmentKeys('secret');
    const sealed = Buffer.from(keys.seal(payload) as string, 'base64url');
    sealed[sealed.length - 1] ^= 1;

    expect(keys.open(sealed.toString('base64url'))).toBeUndefined();
  });

  it('seals nothing without a secret', () => {
    const keys = new AttachmentKeys();

    expect(keys.enabled).toBe(false);
    expect(keys.seal(payload)).toBeUndefined();
  });
});
