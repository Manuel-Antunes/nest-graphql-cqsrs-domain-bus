export interface AgentCoreHealthStatus {
  readonly status: 'Healthy' | 'HealthyBusy';
}

export class AgentCoreHealth {
  static readonly PING_PATH = '/ping';

  private running = 0;

  status(): AgentCoreHealthStatus {
    return { status: this.running > 0 ? 'HealthyBusy' : 'Healthy' };
  }

  begin(): () => void {
    this.running += 1;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.running -= 1;
    };
  }

  async during<T>(work: () => Promise<T>): Promise<T> {
    const end = this.begin();
    try {
      return await work();
    } finally {
      end();
    }
  }

  tracking<T extends { execute(...args: never[]): Promise<void> }>(
    executor: T,
  ): T {
    return new Proxy(executor, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (property !== 'execute' || typeof value !== 'function') return value;
        return (...args: never[]) =>
          this.during(() => value.apply(target, args) as Promise<void>);
      },
    });
  }
}
