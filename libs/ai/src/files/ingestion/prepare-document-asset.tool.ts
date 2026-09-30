import type { BaseRunManager } from '@langchain/core/callbacks/manager';
import type { RunnableConfig } from '@langchain/core/runnables';
import { StructuredTool } from '@langchain/core/tools';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { AttachmentReferences } from '../domain/attachment-references';
import {
  AttachmentScope,
  type AttachmentScopeConfig,
} from '../domain/attachment-scope';
import { AttachmentDrive } from '../drive/attachment-drive';

const prepareDocumentAssetSchema = z.object({
  path: z
    .string()
    .describe(
      'Caminho do arquivo exatamente como aparece no `ls` / no marcador `[Anexo: … path=…]` (ex.: `/attachments/49.pdf`). Também aceita o caminho do sidecar `.meta.json`.',
    ),
});

@Injectable()
export class PrepareDocumentAssetTool extends StructuredTool<
  typeof prepareDocumentAssetSchema
> {
  private readonly logger = new Logger(PrepareDocumentAssetTool.name);

  name = 'prepare_document_asset';
  description =
    'Monta o payload `asset` canônico de um arquivo anexado a partir do seu CAMINHO (path), lendo o sidecar `.meta.json` que a ingestão gravou. Use ANTES de qualquer ferramenta que receba um `asset`: descubra o arquivo com `grep("<termo>")` (por conteúdo), `glob("*.pdf")` (por extensão) ou `ls /attachments/`, então chame `prepare_document_asset({ path })` e repasse o `asset` retornado VERBATIM. Nunca monte o `asset` à mão nem peça o caminho ao usuário. Retorna `{ path, sourceId, kind, fileName, summary, asset }`.';
  schema = prepareDocumentAssetSchema;

  constructor(
    @Inject(AttachmentDrive) private readonly drive: AttachmentDrive,
  ) {
    super();
  }

  protected override async _call(
    { path }: z.infer<typeof prepareDocumentAssetSchema>,
    _runManager?: BaseRunManager,
    config?: RunnableConfig,
  ): Promise<string> {
    const root = AttachmentScope.rootOf(
      config?.configurable as AttachmentScopeConfig | undefined,
    );
    const basename = AttachmentReferences.basenameOf(path);
    if (!basename) {
      return JSON.stringify({
        error: `Caminho inválido: "${path}". Passe o caminho de um arquivo listado por \`ls /attachments\` (ex.: \`/attachments/49.pdf\`).`,
      });
    }

    const sidecar = await this.drive.sidecar(root, basename);
    if (!sidecar) {
      this.logger.warn(
        `[prepare_document_asset] no sidecar for path="${path}" (root="${root}")`,
      );
      return JSON.stringify({
        error: `Nenhum anexo encontrado em "${path}". Confirme o caminho com \`ls /attachments\` ou peça ao usuário para reenviar o arquivo.`,
      });
    }

    if (!(await this.drive.holdsBytesOf(sidecar))) {
      this.logger.warn(
        `[prepare_document_asset] orphan sidecar: no bytes at "${sidecar.asset.path}"`,
      );
      return JSON.stringify({
        error: `O arquivo "${sidecar.attachmentPath}" não está mais no armazenamento (só restou o registro de metadados). Peça ao usuário para reenviar o arquivo.`,
      });
    }

    return JSON.stringify({
      path: sidecar.attachmentPath,
      sourceId: sidecar.sourceId,
      kind: sidecar.kind,
      fileName: sidecar.fileName ?? null,
      summary: (sidecar.transcription ?? sidecar.analysis ?? '').slice(0, 500),
      asset: sidecar.asset,
    });
  }
}
