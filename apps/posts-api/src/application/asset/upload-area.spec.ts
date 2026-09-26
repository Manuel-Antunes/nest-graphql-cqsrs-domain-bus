import { Attachment } from '@nestposts/asset/domain/asset/attachment';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { UploadArea, UploadNotOwnedException } from './upload-area';

describe('UploadArea', () => {
  const uploader = UserId.generate();
  const upload = (name: string) => ({
    name,
    size: 4,
    extname: 'png',
    mimeType: 'image/png',
  });

  it('hands every upload a key of its own, under the uploader', () => {
    const keys = new Set(
      Array.from({ length: 5 }, () => UploadArea.keyFor(uploader)),
    );

    expect(keys.size).toBe(5);
    for (const key of keys) {
      expect(key).toMatch(
        new RegExp(`^tmp/${uploader.value}/\\d+-[0-9a-f-]{36}$`),
      );
    }
  });

  it('stages what the uploader uploaded as an asset that is not stored yet', () => {
    const key = UploadArea.keyFor(uploader);

    const asset = UploadArea.stage(upload(key), uploader);

    expect(asset).toBeInstanceOf(Attachment);
    expect(asset.pending).toBe(true);
    expect(asset).toMatchObject({ extname: 'png', mimeType: 'image/png' });
  });

  it('refuses a key somebody else uploaded, or that is not an upload at all', () => {
    const somebodyElse = UploadArea.keyFor(UserId.generate());

    for (const key of [
      somebodyElse,
      'assets/0a1b.png',
      `tmp/${uploader.value}/../${UserId.generate().value}/file`,
    ]) {
      expect(() => UploadArea.stage(upload(key), uploader)).toThrow(
        UploadNotOwnedException,
      );
    }
  });
});
