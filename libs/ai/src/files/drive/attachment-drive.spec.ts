import { type InMemoryDisk, Storage } from '@nestjs/storage';
import { Attachment } from '@nestposts/asset/domain/asset/attachment';
import { TestDisks } from '@nestposts/asset/infrastructure/testing/test-disks';

import type { AttachmentSidecar } from '../domain/attachment-sidecar';
import { AttachmentDrive } from './attachment-drive';
import { DriveBackend } from './drive.backend';
import { RunScope } from './run-scope';

const ROOT = 'agents/octopus/u1/file-analysis/t1';

let storage: Storage;
let drive: AttachmentDrive;

const sidecarOf = (
  sourceId: string,
  over: Partial<AttachmentSidecar> = {},
): AttachmentSidecar => ({
  sourceId,
  kind: 'document',
  mimeType: 'application/pdf',
  size: 4,
  extname: 'pdf',
  createdAt: 1,
  attachmentPath: `/attachments/${sourceId}.pdf`,
  asset: {
    disk: 'private',
    path: `${ROOT}/${sourceId}.pdf`,
    size: 4,
    extname: 'pdf',
    mimeType: 'application/pdf',
  },
  ...over,
});

beforeEach(() => {
  const { default: fallback, disks } = TestDisks.options();
  storage = new Storage(new Map(Object.entries(disks)), fallback);
  drive = new AttachmentDrive(storage);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AttachmentDrive', () => {
  it('stores an attachment exactly where it is told to', async () => {
    const attachment = await Attachment.fromBuffer(
      Buffer.from('%PDF-1.7'),
      'a.pdf',
    );

    const stored = await drive.store(attachment, {
      disk: 'private',
      path: `${ROOT}/49.pdf`,
    });

    expect(stored).toBe(true);
    expect(await storage.disk('private').getText(`${ROOT}/49.pdf`)).toBe(
      '%PDF-1.7',
    );
    expect(attachment.toObject()).toMatchObject({
      disk: 'private',
      path: `${ROOT}/49.pdf`,
      mimeType: 'application/pdf',
    });
  });

  it('retries a failing write, and reports a write that never landed', async () => {
    const disk = storage.disk('private') as InMemoryDisk;
    const put = vi.spyOn(disk, 'put').mockRejectedValue(new Error('S3 blip'));
    const attachment = await Attachment.fromBuffer(Buffer.from('x'), 'a.txt');

    const stored = await drive.store(attachment, {
      disk: 'private',
      path: `${ROOT}/a.txt`,
    });

    expect(stored).toBe(false);
    expect(put).toHaveBeenCalledTimes(3);
  });

  it('answers the public URL of a public disk, and none for a private one', () => {
    expect(drive.publicUrlOf({ disk: 'public', path: 'a/b.png' })).toBe(
      'http://files.test/public/a/b.png',
    );
    expect(
      drive.publicUrlOf({ disk: 'private', path: 'a/b.png' }),
    ).toBeUndefined();
  });

  it('writes a sidecar beside the bytes and reads it back by source id', async () => {
    const sidecar = sidecarOf('49');

    await drive.writeSidecar(sidecar);

    expect((storage.disk('private') as InMemoryDisk).keys()).toEqual([
      `${ROOT}/49.meta.json`,
    ]);
    expect(await drive.sidecar(ROOT, '49', 'private')).toEqual(sidecar);
    expect(await drive.sidecar(ROOT, 'missing', 'private')).toBeNull();
  });

  it('lists a conversation’s catalog newest first, skipping what it cannot read', async () => {
    await drive.writeSidecar(sidecarOf('old', { createdAt: 1 }));
    await drive.writeSidecar(sidecarOf('new', { createdAt: 2 }));
    await storage.disk('private').put(`${ROOT}/broken.meta.json`, '{not json');
    await storage.disk('private').put(`${ROOT}/new.pdf`, 'bytes');
    await storage
      .disk('private')
      .put('agents/octopus/u9/file-analysis/t9/x.meta.json', '{}');

    const catalog = await drive.catalog(ROOT, 'private');

    expect(catalog.map((sidecar) => sidecar.sourceId)).toEqual(['new', 'old']);
  });

  it('knows whether a sidecar still has its bytes', async () => {
    const sidecar = sidecarOf('49');

    expect(await drive.holdsBytesOf(sidecar)).toBe(false);
    await storage.disk('private').put(sidecar.asset.path, 'bytes');
    expect(await drive.holdsBytesOf(sidecar)).toBe(true);
  });

  it('loads an attachment’s bytes through the asset it recorded', async () => {
    const sidecar = sidecarOf('49', { fileName: 'contrato.pdf' });
    await storage.disk('private').put(sidecar.asset.path, '%PDF');
    await drive.writeSidecar(sidecar);

    const loaded = await drive.load('49', ROOT, 'private');

    expect(loaded.buffer.toString()).toBe('%PDF');
    expect(loaded.mimeType).toBe('application/pdf');
    expect(loaded.fileName).toBe('contrato.pdf');
  });

  it('loads from the run’s own folder when no root is given', async () => {
    vi.spyOn(RunScope, 'configurable').mockReturnValue({
      user_id: 'u1',
      thread_id: 't1',
      attachment_scope: 'octopus',
    });
    const sidecar = sidecarOf('49');
    await storage
      .disk('public')
      .put(`${ROOT}/49.meta.json`, JSON.stringify(sidecar));
    await storage.disk('private').put(sidecar.asset.path, '%PDF');

    expect((await drive.load('49')).buffer.toString()).toBe('%PDF');
  });

  it('refuses to load an attachment it has no record of', async () => {
    await expect(drive.load('49', ROOT)).rejects.toThrow(/sourceId="49"/);
  });

  it('builds a drive backend scoped to the run', () => {
    expect(drive.backend('private')).toBeInstanceOf(DriveBackend);
  });
});
