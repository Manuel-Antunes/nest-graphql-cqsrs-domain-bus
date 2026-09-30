import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import type { STTService } from '../../services/stt.service';
import type { ContentExtractionService } from './content-extraction.service';
import { FileAnalysisService } from './file-analysis.service';
import type { PdfAnalysisService } from './pdf-analysis.service';
import type { VisionAnalysisService } from './vision-analysis.service';

const input = (mimeType: string, filename = 'arquivo') => ({
  filename,
  buffer: Buffer.from('x'),
  mimeType,
});

let model: { invoke: ReturnType<typeof vi.fn> };
let stt: { transcribe: ReturnType<typeof vi.fn> };
let vision: { analyzeImage: ReturnType<typeof vi.fn> };
let extraction: { extractContent: ReturnType<typeof vi.fn> };
let pdf: { analyzeFullPdf: ReturnType<typeof vi.fn> };
let service: FileAnalysisService;

beforeEach(() => {
  model = { invoke: vi.fn(async () => ({ content: 'análise do modelo' })) };
  stt = { transcribe: vi.fn(async () => 'transcrição') };
  vision = { analyzeImage: vi.fn(async () => 'descrição da imagem') };
  extraction = { extractContent: vi.fn(async () => 'texto extraído') };
  pdf = { analyzeFullPdf: vi.fn(async () => 'análise do pdf') };
  service = new FileAnalysisService(
    model as unknown as BaseChatModel,
    stt as unknown as STTService,
    vision as unknown as VisionAnalysisService,
    extraction as unknown as ContentExtractionService,
    pdf as unknown as PdfAnalysisService,
  );
});

describe('FileAnalysisService', () => {
  it('routes an attachment by its MIME type', async () => {
    expect(await service.analyzeAttachment(input('image/png'))).toBe(
      'descrição da imagem',
    );
    expect(await service.analyzeAttachment(input('audio/ogg'))).toBe(
      'transcrição',
    );
    expect(await service.analyzeAttachment(input('application/pdf'))).toBe(
      'análise do pdf',
    );
    expect(
      await service.analyzeAttachment(input('text/csv', 'planilha.csv')),
    ).toBe('análise do modelo');
  });

  it('treats a .pdf name as a PDF even under a generic MIME type', async () => {
    await service.analyzeDocument(
      input('application/octet-stream', 'contrato.PDF'),
    );

    expect(pdf.analyzeFullPdf).toHaveBeenCalledOnce();
    expect(extraction.extractContent).not.toHaveBeenCalled();
  });

  it('analyses the files in the agent’s state, skipping what has no content', async () => {
    expect(
      await service.analyzeStateFiles('resuma', {
        '/notas.md': { content: '# notas' },
        '/vazio.bin': {},
      }),
    ).toBe('análise do modelo');
    expect(extraction.extractContent).toHaveBeenCalledOnce();
  });

  it('says so when the state holds no file', async () => {
    expect(await service.analyzeStateFiles(undefined, {})).toBe(
      'Nenhum arquivo encontrado para análise no contexto atual.',
    );
    expect(model.invoke).not.toHaveBeenCalled();
  });
});
