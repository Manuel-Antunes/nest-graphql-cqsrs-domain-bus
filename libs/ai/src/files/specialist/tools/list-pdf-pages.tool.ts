import { StructuredTool } from '@langchain/core/tools';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { FileAnalysisService } from '../../analysis/file-analysis.service';
import { AttachmentReferences } from '../../domain/attachment-references';
import { AttachmentDrive } from '../../drive/attachment-drive';
import { AttachmentPathSchema } from './attachment-path.schema';

const listPdfPagesSchema = z.object({ path: AttachmentPathSchema });

@Injectable()
export class ListPdfPagesTool extends StructuredTool<
  typeof listPdfPagesSchema
> {
  name = 'list_pdf_pages';
  description =
    'Lista as páginas de um PDF anexado, com a contagem de imagens e o tamanho do texto por página. Útil antes de mergulhar em uma página específica via `analyze_pdf_page`.';
  schema = listPdfPagesSchema;

  constructor(
    @Inject(AttachmentDrive) private readonly drive: AttachmentDrive,
    @Inject(FileAnalysisService)
    private readonly fileAnalysis: FileAnalysisService,
  ) {
    super();
  }

  protected override async _call({
    path,
  }: z.infer<typeof listPdfPagesSchema>): Promise<string> {
    const sourceId = AttachmentReferences.basenameOf(path);
    const { buffer, fileName, mimeType } = await this.drive.load(sourceId);
    return JSON.stringify(
      await this.fileAnalysis.listPdfPages({
        filename: fileName ?? sourceId,
        buffer,
        mimeType,
      }),
    );
  }
}
