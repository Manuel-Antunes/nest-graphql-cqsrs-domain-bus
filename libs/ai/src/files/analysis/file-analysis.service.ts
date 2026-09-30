import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Inject, Injectable, Logger } from '@nestjs/common';

import type { STTOptions, STTService } from '../../services/stt.service';
import { ContentExtractionService } from './content-extraction.service';
import type { FileAnalysisInput, PdfPageOverview } from './file-analysis.types';
import { PdfAnalysisService } from './pdf-analysis.service';
import { VisionAnalysisService } from './vision-analysis.service';

interface StateFile {
  content?: unknown;
  mimeType?: string;
}

@Injectable()
export class FileAnalysisService {
  private readonly logger = new Logger(FileAnalysisService.name);

  constructor(
    @Inject('CHAT_MODEL') private readonly model: BaseChatModel,
    @Inject('STT_SERVICE') private readonly sttService: STTService,
    @Inject(VisionAnalysisService)
    private readonly vision: VisionAnalysisService,
    @Inject(ContentExtractionService)
    private readonly extraction: ContentExtractionService,
    @Inject(PdfAnalysisService)
    private readonly pdfAnalysis: PdfAnalysisService,
  ) {}

  transcribeAudio(
    input: FileAnalysisInput,
    options?: STTOptions,
  ): Promise<string> {
    this.logger.log(
      `[transcribeAudio] ${input.filename} (${input.mimeType}, ${input.buffer.byteLength} bytes)`,
    );
    return this.sttService.transcribe(input.buffer, input.mimeType, options);
  }

  analyzeImage(input: FileAnalysisInput): Promise<string> {
    return this.vision.analyzeImage(input);
  }

  async analyzeDocument(input: FileAnalysisInput): Promise<string> {
    this.logger.log(
      `[analyzeDocument] ${input.filename} (${input.mimeType}, ${input.buffer.byteLength} bytes)`,
    );
    if (FileAnalysisService.isPdf(input)) {
      return this.pdfAnalysis.analyzeFullPdf(input);
    }
    const extracted = await this.extraction.extractContent(
      input.filename,
      input.buffer,
      input.mimeType,
    );
    const response = await this.model.invoke([
      new SystemMessage(
        'Você recebeu o conteúdo extraído de um arquivo enviado pelo usuário. Analise-o conforme o foco solicitado.',
      ),
      new HumanMessage(
        `Foco: ${input.hint || 'Resumo geral e dados principais'}\n\nArquivo: ${input.filename}\n\nConteúdo:\n${extracted}`,
      ),
    ]);
    return String(response.content);
  }

  analyzeAttachment(input: FileAnalysisInput): Promise<string> {
    if (input.mimeType.startsWith('image/')) return this.analyzeImage(input);
    if (input.mimeType.startsWith('audio/')) return this.transcribeAudio(input);
    return this.analyzeDocument(input);
  }

  analyzePdfPage(
    input: FileAnalysisInput,
    pageNumber: number,
    focus?: string,
  ): Promise<string> {
    return this.pdfAnalysis.analyzePdfPage(input, pageNumber, focus);
  }

  listPdfPages(input: FileAnalysisInput): Promise<PdfPageOverview[]> {
    return this.pdfAnalysis.listPdfPages(input);
  }

  async analyzeStateFiles(
    focus: string | undefined,
    files: Record<string, StateFile>,
  ): Promise<string> {
    const entries = Object.entries(files);
    if (entries.length === 0) {
      return 'Nenhum arquivo encontrado para análise no contexto atual.';
    }

    const extractions: string[] = [];
    for (const [filename, file] of entries) {
      const buffer = FileAnalysisService.bufferOf(file.content);
      if (!buffer) {
        this.logger.warn(
          `Arquivo ${filename} sem conteúdo válido para análise.`,
        );
        continue;
      }
      try {
        const content = await this.extraction.extractContent(
          filename,
          buffer,
          file.mimeType ?? 'application/octet-stream',
        );
        extractions.push(`--- Arquivo: ${filename} ---\n${content}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Erro ao processar arquivo ${filename}: ${message}`);
        extractions.push(
          `--- Arquivo: ${filename} ---\nErro no processamento: ${message}`,
        );
      }
    }

    const response = await this.model.invoke([
      new SystemMessage(
        'Você recebeu o conteúdo extraído de vários arquivos. Analise-os conforme o foco solicitado.',
      ),
      new HumanMessage(
        `Foco da análise: ${focus || 'Resumo geral'}\n\nConteúdo dos arquivos:\n${extractions.join('\n\n')}`,
      ),
    ]);
    return String(response.content);
  }

  private static bufferOf(content: unknown): Buffer | undefined {
    if (content instanceof Uint8Array) return Buffer.from(content);
    if (typeof content === 'string') return Buffer.from(content);
    if (Array.isArray(content)) return Buffer.from(content.join('\n'));
    return undefined;
  }

  private static isPdf(input: FileAnalysisInput): boolean {
    return (
      input.mimeType === 'application/pdf' ||
      (input.filename ?? '').toLowerCase().endsWith('.pdf')
    );
  }
}
