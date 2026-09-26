import { MissingPackageException } from '../errors/attachment.exceptions';

/**
 * Loads a package only the features that need it require — `sharp`, `file-type`, `exifreader` — so
 * a process that never converts an image does not have to install them, and one that does and
 * lacks them is told which package to install ({@link MissingPackageException}).
 *
 * The loader is a literal `import('…')`, never a computed name: a bundler resolves literals, and the
 * applications here keep every third-party package external by its literal name.
 */
export class OptionalPackage {
  static async load<T>(name: string, loader: () => Promise<T>): Promise<T> {
    try {
      return await loader();
    } catch (error) {
      if (OptionalPackage.isMissing(error, name)) {
        throw new MissingPackageException(name, { cause: error });
      }
      throw error;
    }
  }

  /** The default export of a module loaded either as CommonJS or as ESM. */
  static defaultOf<T>(module: T | { default: T }): T {
    return (module as { default?: T }).default ?? (module as T);
  }

  private static isMissing(error: unknown, name: string): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    const message = error instanceof Error ? error.message : '';
    return (
      (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
      message.includes(name)
    );
  }
}
