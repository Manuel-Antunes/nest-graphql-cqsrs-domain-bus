export class ExpiringValue<T> {
  private current?: { loadedAt: number; value: Promise<T> };

  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
    private readonly now: () => number = Date.now,
  ) {}

  get(): Promise<T> {
    if (this.current && this.now() - this.current.loadedAt < this.ttlMs) {
      return this.current.value;
    }
    const value = this.load();
    const entry = { loadedAt: this.now(), value };
    this.current = entry;
    value.catch(() => {
      if (this.current === entry) {
        this.current = undefined;
      }
    });
    return value;
  }
}
