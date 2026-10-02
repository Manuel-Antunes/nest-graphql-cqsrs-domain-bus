export type LazyFactory<T> = () => T | Promise<T>;

export class Lazy<T> {
  private built?: Promise<T>;

  constructor(private readonly factory: LazyFactory<T>) {}

  get(): Promise<T> {
    this.built ??= Promise.resolve()
      .then(this.factory)
      .catch((error: unknown) => {
        this.built = undefined;
        throw error;
      });
    return this.built;
  }

  peek(): Promise<T> | undefined {
    return this.built;
  }
}
