import { StructuredTool } from '@langchain/core/tools';
import { getCurrentTaskInput } from '@langchain/langgraph';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { FileAnalysisService } from '../../analysis/file-analysis.service';

const analyzeStateFilesSchema = z.object({
  focus: z
    .string()
    .optional()
    .describe('Foco opcional ou pergunta específica sobre os arquivos.'),
});

@Injectable()
export class AnalyzeStateFilesTool extends StructuredTool<
  typeof analyzeStateFilesSchema
> {
  name = 'analyze_context_files';
  description =
    'Analisa arquivos gravados no workspace do próprio agente (state). NÃO serve para anexos enviados pelo usuário na conversa — para esses use `analyze_attachment` com o caminho do anexo.';
  schema = analyzeStateFilesSchema;

  constructor(
    @Inject(FileAnalysisService)
    private readonly fileAnalysis: FileAnalysisService,
  ) {
    super();
  }

  protected override async _call({
    focus,
  }: z.infer<typeof analyzeStateFilesSchema>): Promise<string> {
    const state = getCurrentTaskInput() as
      | { files?: Record<string, { content?: unknown; mimeType?: string }> }
      | undefined;
    return this.fileAnalysis.analyzeStateFiles(focus, state?.files ?? {});
  }
}
