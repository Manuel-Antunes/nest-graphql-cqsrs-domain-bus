import { StructuredTool } from '@langchain/core/tools';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { FileAnalysisService } from '../../analysis/file-analysis.service';
import { AttachmentReferences } from '../../domain/attachment-references';
import { AttachmentDrive } from '../../drive/attachment-drive';
import { AttachmentPathSchema } from './attachment-path.schema';

const analyzeAttachmentSchema = z.object({
  path: AttachmentPathSchema,
  focus: z
    .string()
    .optional()
    .describe(
      'O que você quer saber deste arquivo. Seja específico — é isso que direciona a análise (ex.: "a cor da camisa da pessoa na foto").',
    ),
});

@Injectable()
export class AnalyzeAttachmentTool extends StructuredTool<
  typeof analyzeAttachmentSchema
> {
  private readonly logger = new Logger(AnalyzeAttachmentTool.name);

  name = 'analyze_attachment';
  description =
    'Analisa (ou reanalisa, com outro foco) um arquivo que o usuário anexou na conversa. Passe o caminho do anexo como ele aparece na conversa e diga no `focus` o que você precisa saber. Use SEMPRE esta ferramenta para arquivos anexados — imagens, PDFs, documentos e áudios.';
  schema = analyzeAttachmentSchema;

  constructor(
    @Inject(AttachmentDrive) private readonly drive: AttachmentDrive,
    @Inject(FileAnalysisService)
    private readonly fileAnalysis: FileAnalysisService,
  ) {
    super();
  }

  protected override async _call({
    path,
    focus,
  }: z.infer<typeof analyzeAttachmentSchema>): Promise<string> {
    const sourceId = AttachmentReferences.basenameOf(path);
    if (!sourceId) return `Caminho de anexo inválido: "${path}".`;

    try {
      const loaded = await this.drive.load(sourceId);
      return await this.fileAnalysis.analyzeAttachment({
        filename: loaded.fileName ?? sourceId,
        buffer: loaded.buffer,
        mimeType: loaded.mimeType,
        ...(focus ? { hint: focus } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[analyze_attachment] "${path}" (sourceId="${sourceId}"): ${message}`,
      );
      return `Não foi possível analisar o anexo "${path}" (sourceId="${sourceId}"): ${message}`;
    }
  }
}
