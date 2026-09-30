import type { FileAnalysisService } from '../../analysis/file-analysis.service';
import type { AttachmentDrive } from '../../drive/attachment-drive';
import { AnalyzeAttachmentTool } from './analyze-attachment.tool';
import { AnalyzePdfPageTool } from './analyze-pdf-page.tool';
import { ListPdfPagesTool } from './list-pdf-pages.tool';

const loaded = {
  buffer: Buffer.from('%PDF'),
  mimeType: 'application/pdf',
  fileName: 'procuracao.pdf',
};

let drive: { load: ReturnType<typeof vi.fn> };
let analysis: {
  analyzeAttachment: ReturnType<typeof vi.fn>;
  analyzePdfPage: ReturnType<typeof vi.fn>;
  listPdfPages: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  drive = { load: vi.fn(async () => loaded) };
  analysis = {
    analyzeAttachment: vi.fn(async () => 'uma procuração'),
    analyzePdfPage: vi.fn(async () => 'página 2: uma tabela'),
    listPdfPages: vi.fn(async () => [
      { pageNumber: 1, textLength: 10, imageCount: 0 },
    ]),
  };
});

const tools = () => ({
  analyzeAttachment: new AnalyzeAttachmentTool(
    drive as unknown as AttachmentDrive,
    analysis as unknown as FileAnalysisService,
  ),
  analyzePdfPage: new AnalyzePdfPageTool(
    drive as unknown as AttachmentDrive,
    analysis as unknown as FileAnalysisService,
  ),
  listPdfPages: new ListPdfPagesTool(
    drive as unknown as AttachmentDrive,
    analysis as unknown as FileAnalysisService,
  ),
});

describe('the specialist’s attachment tools', () => {
  it('re-analyses an attachment by the path the conversation shows, with a focus', async () => {
    expect(
      await tools().analyzeAttachment.invoke({
        path: '/attachments/49.pdf',
        focus: 'quem outorga',
      }),
    ).toBe('uma procuração');
    expect(drive.load).toHaveBeenCalledWith('49');
    expect(analysis.analyzeAttachment).toHaveBeenCalledWith({
      filename: 'procuracao.pdf',
      buffer: loaded.buffer,
      mimeType: 'application/pdf',
      hint: 'quem outorga',
    });
  });

  it('reports the path and the id it tried when the attachment cannot be loaded', async () => {
    drive.load.mockRejectedValueOnce(new Error('Nenhum anexo encontrado'));

    expect(
      await tools().analyzeAttachment.invoke({ path: '/attachments/49.pdf' }),
    ).toBe(
      'Não foi possível analisar o anexo "/attachments/49.pdf" (sourceId="49"): Nenhum anexo encontrado',
    );
  });

  it('refuses a path that names no file', async () => {
    expect(await tools().analyzeAttachment.invoke({ path: '/' })).toBe(
      'Caminho de anexo inválido: "/".',
    );
  });

  it('analyses one PDF page and lists the pages, both by the attachment’s path', async () => {
    const { analyzePdfPage, listPdfPages } = tools();

    expect(
      await analyzePdfPage.invoke({
        path: '/attachments/49.pdf',
        pageNumber: 2,
      }),
    ).toBe('página 2: uma tabela');
    expect(JSON.parse(await listPdfPages.invoke({ path: '49' }))).toEqual([
      { pageNumber: 1, textLength: 10, imageCount: 0 },
    ]);
    expect(analysis.analyzePdfPage).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'procuracao.pdf' }),
      2,
      undefined,
    );
  });
});
