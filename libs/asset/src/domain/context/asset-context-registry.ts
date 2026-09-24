/**
 * Ambient values an attachment strategy can read. `tenantId` is named because scoping a key by
 * tenant is the common case; the bag is open to whatever a folder strategy needs.
 */
export interface AssetContextData {
  tenantId?: string;
  [key: string]: unknown;
}

export type AssetContextReader = () => AssetContextData;

const NO_CONTEXT: AssetContextReader = () => ({});

let reader: AssetContextReader = NO_CONTEXT;

/**
 * Where the domain reads the ambient context from, without depending on how a process tracks it.
 *
 * `AssetContext` (`@nestposts/asset/infrastructure/context/asset-context`) installs itself here on
 * import. With no reader installed every strategy sees an empty context.
 */
export const AssetContextRegistry = {
  use(next: AssetContextReader): void {
    reader = next;
  },

  reset(): void {
    reader = NO_CONTEXT;
  },

  read(): AssetContextData {
    return reader();
  },
};
