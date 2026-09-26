import type { Converter } from '../../domain/converter/converter';

/** The converters the module was configured with, by the variant name each makes. */
export class ConverterRegistry {
  constructor(
    private readonly converters: Readonly<Record<string, Converter>> = {},
  ) {}

  get(key: string): Converter | undefined {
    return Object.hasOwn(this.converters, key)
      ? this.converters[key]
      : undefined;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  keys(): string[] {
    return Object.keys(this.converters);
  }
}
