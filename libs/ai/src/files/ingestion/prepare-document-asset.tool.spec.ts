import { Storage } from '@nestjs/storage';
import { TestDisks } from '@nestposts/asset/infrastructure/testing/test-disks';

import type { AttachmentSidecar } from '../domain/attachment-sidecar';
import { AttachmentDrive } from '../drive/attachment-drive';
import { PrepareDocumentAssetTool } from './prepare-document-asset.tool';

const CONFIGURABLE = {
  user_id: 'u1',
  thread_id: 't1',
  attachment_scope: 'natasha',
};
const ROOT = 'agents/natasha/u1/file-analysis/t1';

const SIDECAR: AttachmentSidecar = {
  sourceId: '49',
  kind: 'document',
  fileName: 'procuracao.pdf',
  mimeType: 'application/pdf',
  size: 4,
  extname: 'pdf',
  createdAt: 1,
  attachmentPath: '/attachments/49.pdf',
  asset: {
    disk: 'public',
    path: `${ROOT}/49.pdf`,
    originalName: 'procuracao.pdf',
    size: 4,
    extname: 'pdf',
    mimeType: 'application/pdf',
  },
  analysis: 'uma procuração ad judicia',
};

let storage: Storage;
let tool: PrepareDocumentAssetTool;

const call = async (path: string) =>
  JSON.parse(
    await tool.invoke({ path }, { configurable: CONFIGURABLE }),
  ) as Record<string, unknown>;

beforeEach(async () => {
  const { default: fallback, disks } = TestDisks.options();
  storage = new Storage(new Map(Object.entries(disks)), fallback);
  tool = new PrepareDocumentAssetTool(new AttachmentDrive(storage));
  await storage
    .disk('public')
    .put(`${ROOT}/49.meta.json`, JSON.stringify(SIDECAR));
  await storage.disk('public').put(`${ROOT}/49.pdf`, '%PDF');
});

describe('PrepareDocumentAssetTool', () => {
  it('builds the canonical asset of a file from its path, in the run’s folder', async () => {
    expect(await call('/attachments/49.pdf')).toEqual({
      path: '/attachments/49.pdf',
      sourceId: '49',
      kind: 'document',
      fileName: 'procuracao.pdf',
      summary: 'uma procuração ad judicia',
      asset: SIDECAR.asset,
    });
  });

  it('accepts the sidecar path as well', async () => {
    expect((await call('/attachments/49.meta.json')).sourceId).toBe('49');
  });

  it('refuses a path that names no file', async () => {
    expect((await call('/')).error).toMatch(/Caminho inválido/);
  });

  it('says so when the conversation has no such file', async () => {
    expect((await call('/attachments/50.pdf')).error).toMatch(
      /Nenhum anexo encontrado/,
    );
  });

  it('refuses an orphan sidecar instead of handing out an asset with no bytes', async () => {
    await storage.disk('public').delete(`${ROOT}/49.pdf`);

    expect((await call('/attachments/49.pdf')).error).toMatch(
      /não está mais no armazenamento/,
    );
  });
});
