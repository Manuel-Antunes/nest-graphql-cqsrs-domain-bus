import { StructuredTool } from '@langchain/core/tools';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { FileAnalysisService } from '../../analysis/file-analysis.service';
import { AttachmentReferences } from '../../domain/attachment-references';
import { AttachmentDrive } from '../../drive/attachment-drive';
import { AttachmentPathSchema } from './attachment-path.schema';

const analyzePdfPageSchema = z.object({
  path: AttachmentPathSchema,
  pageNumber: z
    .number()
    .int()
    .min(1)
    .describe('Número da página a ser analisada (1-indexado).'),
  focus: z
    .string()
    .optional()
    .describe('Foco específico ou pergunta sobre essa página.'),
});

@Injectable()
export class AnalyzePdfPageTool extends StructuredTool<
  typeof analyzePdfPageSchema
> {
  name = 'analyze_pdf_page';
  description =
    'Analisa em profundidade uma página específica de um PDF anexado — extrai o texto e descreve qualquer imagem, gráfico ou diagrama presente. Passe o caminho do anexo como ele aparece na conversa.';
  schema = analyzePdfPageSchema;

  constructor(
    @Inject(AttachmentDrive) private readonly drive: AttachmentDrive,
    @Inject(FileAnalysisService)
    private readonly fileAnalysis: FileAnalysisService,
  ) {
    super();
  }

  protected override async _call({
    path,
    pageNumber,
    focus,
  }: z.infer<typeof analyzePdfPageSchema>): Promise<string> {
    const sourceId = AttachmentReferences.basenameOf(path);
    const { buffer, fileName, mimeType } = await this.drive.load(sourceId);
    return this.fileAnalysis.analyzePdfPage(
      { filename: fileName ?? sourceId, buffer, mimeType },
      pageNumber,
      focus,
    );
  }
}
