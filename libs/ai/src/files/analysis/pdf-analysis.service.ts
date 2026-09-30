import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Inject, Injectable, Logger } from '@nestjs/common';

import type { FileAnalysisInput, PdfPageOverview } from './file-analysis.types';
import { PdfParserService } from './pdf-parser.service';
import { VisionAnalysisService } from './vision-analysis.service';

@Injectable()
export class PdfAnalysisService {
  private readonly logger = new Logger(PdfAnalysisService.name);

  constructor(
    @Inject('CHAT_MODEL') private readonly model: BaseChatModel,
    @Inject(PdfParserService) private readonly parser: PdfParserService,
    @Inject(VisionAnalysisService)
    private readonly vision: VisionAnalysisService,
  ) {}

  async analyzeFullPdf(
    input: FileAnalysisInput,
    focus?: string,
  ): Promise<string> {
    this.logger.log(`[analyzeFullPdf] ${input.filename}`);
    const pages = await this.parser.extractPages(input.buffer);
    if (!pages.length) {
      return 'PDF vazio — nenhuma página para analisar.';
    }

    const totalImages = pages.reduce((sum, p) => sum + p.images.length, 0);
    this.logger.log(
      `[analyzeFullPdf] ${input.filename} — ${pages.length} página(s), ${totalImages} imagem(ns) embutida(s)`,
    );

    const pageSummaries: string[] = [];
    for (const page of pages) {
      const summary = await this.vision.analyzePage(input.filename, page);
      pageSummaries.push(`### Página ${page.pageNumber}\n${summary}`);
    }

    const combined = pageSummaries.join('\n\n');
    const finalResponse = await this.model.invoke([
      new SystemMessage(
        'Você recebeu análises individuais de cada página de um documento PDF. Produza um resumo consolidado, destacando os pontos-chave e indicando em quais páginas estão dados ou imagens importantes.',
      ),
      new HumanMessage(
        `Foco geral: ${focus || input.hint || 'visão geral do documento'}\n\nArquivo: ${input.filename}\n\nAnálises por página:\n${combined}`,
      ),
    ]);
    return String(finalResponse.content);
  }

  async analyzePdfPage(
    input: FileAnalysisInput,
    pageNumber: number,
    focus?: string,
  ): Promise<string> {
    if (pageNumber < 1) {
      throw new Error(
        `Número de página inválido: ${pageNumber} (deve ser >= 1).`,
      );
    }
    const pages = await this.parser.extractPages(input.buffer);
    const page = pages.find((p) => p.pageNumber === pageNumber);
    if (!page) {
      throw new Error(
        `Página ${pageNumber} não encontrada (PDF possui ${pages.length} página(s)).`,
      );
    }
    return this.vision.analyzePage(input.filename, page, focus ?? input.hint);
  }

  async listPdfPages(input: FileAnalysisInput): Promise<PdfPageOverview[]> {
    const pages = await this.parser.extractPages(input.buffer);
    return pages.map((p) => ({
      pageNumber: p.pageNumber,
      textLength: p.text.length,
      imageCount: p.images.length,
    }));
  }
}
