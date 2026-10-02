import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

import type { AgentCaller } from './agent-caller';

@Injectable()
export class AgentCallers {
  private readonly storage = new AsyncLocalStorage<AgentCaller | undefined>();

  run<T>(caller: AgentCaller | undefined, work: () => T): T {
    return this.storage.run(caller, work);
  }

  current(): AgentCaller | undefined {
    return this.storage.getStore();
  }

  currentAs<T extends AgentCaller>(
    type: abstract new (...args: never[]) => T,
  ): T | undefined {
    const caller = this.current();
    return caller instanceof type ? caller : undefined;
  }
}
