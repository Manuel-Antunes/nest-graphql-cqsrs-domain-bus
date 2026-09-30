import { z } from 'zod';

export const AttachmentPathSchema = z
  .string()
  .describe(
    'Caminho do anexo como citado na conversa (ex.: `/attachments/abc-file-0.png`). Também aceita o `sourceId` puro ou o caminho do sidecar `.meta.json`.',
  );
