/**
 * Ambient values an attachment strategy can read. `tenantId` is named because scoping a key by
 * tenant is the common case; the bag is open to whatever a strategy needs.
 */
export interface AttachmentContextData {
  tenantId?: string;
  [key: string]: unknown;
}

export type AttachmentContextReader = () => AttachmentContextData;

const NO_CONTEXT: AttachmentContextReader = () => ({});

let reader: AttachmentContextReader = NO_CONTEXT;

/**
 * Where the domain reads the ambient context from, without depending on how a process tracks it.
 *
 * `AttachmentContext` (`@nestposts/asset/infrastructure/context/attachment-context`) installs itself
 * here on import. With no reader installed every strategy sees an empty context.
 */
export const AttachmentContextRegistry = {
  use(next: AttachmentContextReader): void {
    reader = next;
  },

  reset(): void {
    reader = NO_CONTEXT;
  },

  read(): AttachmentContextData {
    return reader();
  },
};
