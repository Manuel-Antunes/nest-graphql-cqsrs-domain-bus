import {
  AttachmentReferences,
  type ResolvedAttachmentAsset,
} from './attachment-references';
import type { AttachmentSidecar } from './attachment-sidecar';

describe('AttachmentReferences.basenameOf', () => {
  it.each([
    ['/attachments/49.pdf', '49'],
    ['/attachments/49.meta.json', '49'],
    ['/attachments/FPESYM9QYhj6SM0i-file-0.png', 'FPESYM9QYhj6SM0i-file-0'],
    ['49.ogg', '49'],
  ])('%s → %s', (input, expected) => {
    expect(AttachmentReferences.basenameOf(input)).toBe(expected);
  });
});

describe('AttachmentReferences.pathsIn', () => {
  const prefix = '/attachments';

  it('pulls a path out of prose wrapped in quotes', () => {
    const text =
      "Associar o documento referente ao arquivo '/attachments/FPESYM9QYhj6SM0i-file-0.png' ao exequente.";
    expect(AttachmentReferences.pathsIn(text, prefix)).toEqual([
      '/attachments/FPESYM9QYhj6SM0i-file-0.png',
    ]);
  });

  it('trims trailing sentence punctuation but keeps the extension', () => {
    expect(
      AttachmentReferences.pathsIn('use /attachments/49.pdf.', prefix),
    ).toEqual(['/attachments/49.pdf']);
    expect(
      AttachmentReferences.pathsIn('em `/attachments/49.pdf`, ok', prefix),
    ).toEqual(['/attachments/49.pdf']);
  });

  it('dedupes repeated mentions and finds several files', () => {
    const text =
      '/attachments/a.png e /attachments/b.pdf e de novo /attachments/a.png';
    expect(AttachmentReferences.pathsIn(text, prefix)).toEqual([
      '/attachments/a.png',
      '/attachments/b.pdf',
    ]);
  });

  it('returns nothing when no attachment is referenced', () => {
    expect(
      AttachmentReferences.pathsIn('vincule ao exequente X', prefix),
    ).toEqual([]);
    expect(AttachmentReferences.pathsIn('veja /attachments/', prefix)).toEqual(
      [],
    );
  });
});

describe('AttachmentReferences.matchCited', () => {
  const make = (over: Partial<AttachmentSidecar>): AttachmentSidecar =>
    ({
      sourceId: '361',
      kind: 'image',
      mimeType: 'image/png',
      size: 1,
      extname: 'png',
      createdAt: 1,
      attachmentPath: '/attachments/361.png',
      asset: {
        disk: 'private',
        path: 'k/361.png',
        size: 1,
        extname: 'png',
        mimeType: 'image/png',
      },
      ...over,
    }) as AttachmentSidecar;

  it('matches the real basename', () => {
    const s = make({});
    expect(AttachmentReferences.matchCited('/attachments/361.png', [s])).toBe(
      s,
    );
  });

  it('recovers the `<kind>-<sourceId>` display label the model stitched in', () => {
    const s = make({ fileName: undefined });
    expect(
      AttachmentReferences.matchCited('/attachments/image-361.png', [s]),
    ).toBe(s);
  });

  it('matches by fileName, with or without the extension', () => {
    const s = make({ sourceId: '99', fileName: 'passaporte.png' });
    expect(
      AttachmentReferences.matchCited('/attachments/passaporte.png', [s]),
    ).toBe(s);
    expect(
      AttachmentReferences.matchCited('/attachments/passaporte.pdf', [s]),
    ).toBe(s);
  });

  it('refuses to guess: no match and ambiguous match both yield null', () => {
    const s = make({});
    expect(
      AttachmentReferences.matchCited('/attachments/audio-999.ogg', [s]),
    ).toBeNull();

    const a = make({ sourceId: '1', fileName: 'doc.pdf' });
    const b = make({ sourceId: '2', fileName: 'doc.pdf' });
    expect(
      AttachmentReferences.matchCited('/attachments/doc.pdf', [a, b]),
    ).toBeNull();
  });
});

describe('AttachmentReferences.render', () => {
  const assets: ResolvedAttachmentAsset[] = [
    {
      path: '/attachments/49.png',
      fileName: 'passaporte.png',
      kind: 'image',
      asset: {
        disk: 'private',
        path: 'agents/octopus/u1/file-analysis/t1/49.png',
        originalName: 'passaporte.png',
        size: 11776564,
        extname: 'png',
        mimeType: 'image/png',
      },
    },
  ];

  it('emits the header (the idempotency marker) and the asset as one-line JSON', () => {
    const block = AttachmentReferences.render(assets);

    expect(block).toContain(AttachmentReferences.RESOLVED_ASSETS_HEADER);
    expect(block).toContain(JSON.stringify(assets[0].asset));
    expect(block).toContain('/attachments/49.png');
    expect(block).toContain('passaporte.png');
  });
});
