import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '@a2a-js/sdk/server';
import { Injectable } from '@nestjs/common';

@Injectable()
export class A2aCallers {
  private readonly storage = new AsyncLocalStorage<User | undefined>();

  run<T>(caller: User | undefined, work: () => T): T {
    return this.storage.run(caller, work);
  }

  current(): User | undefined {
    return this.storage.getStore();
  }

  currentAs<T extends User>(
    type: abstract new (...args: never[]) => T,
  ): T | undefined {
    const caller = this.current();
    return caller instanceof type ? caller : undefined;
  }
}
