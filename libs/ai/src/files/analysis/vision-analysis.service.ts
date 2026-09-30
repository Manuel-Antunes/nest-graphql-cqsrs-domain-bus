import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { Inject, Injectable, Logger } from '@nestjs/common';

import type { FileAnalysisInput, PdfPageData } from './file-analysis.types';

@Injectable()
export class VisionAnalysisService {
  private readonly logger = new Logger(VisionAnalysisService.name);

  constructor(@Inject('CHAT_MODEL') private readonly model: BaseChatModel) {}

  async analyzeImage(input: FileAnalysisInput): Promise<string> {
    this.logger.log(
      `[analyzeImage] ${input.filename} (${input.mimeType}, ${input.buffer.byteLength} bytes)`,
    );
    const base64 = input.buffer.toString('base64');
    const promptText = input.hint
      ? `Descreva detalhadamente o conteúdo desta imagem e extraia qualquer texto ou dado nela contido. Contexto fornecido pelo usuário: "${input.hint}".`
      : 'Descreva detalhadamente o conteúdo desta imagem e extraia qualquer texto ou dado nela contido.';
    const response = await this.model.invoke([
      new HumanMessage({
        content: [
          { type: 'text', text: promptText },
          {
            type: 'image_url',
            image_url: {
              url: `data:${input.mimeType || 'image/jpeg'};base64,${base64}`,
            },
          },
        ],
      }),
    ]);
    return String(response.content);
  }

  async analyzePage(
    filename: string,
    page: PdfPageData,
    focus?: string,
  ): Promise<string> {
    const promptLines = [
      `Analise a página ${page.pageNumber} do arquivo "${filename}".`,
      focus
        ? `Foco solicitado: ${focus}`
        : 'Resuma o conteúdo, extraia dados importantes e descreva o conteúdo de gráficos, tabelas e imagens caso existam.',
      '',
      page.images.length
        ? `A página contém ${page.images.length} imagem(ns) anexa(s) abaixo — descreva cada uma e relacione com o texto.`
        : 'Página sem imagens embutidas — analise apenas o texto extraído.',
      '',
      page.text
        ? `### Texto extraído da página ${page.pageNumber}\n${page.text}`
        : '(Página sem texto extraível.)',
    ];

    const contentParts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: promptLines.join('\n') }];

    for (const image of page.images) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
        },
      });
    }

    const response = await this.model.invoke([
      new HumanMessage({ content: contentParts as never }),
    ]);
    return String(response.content);
  }
}
