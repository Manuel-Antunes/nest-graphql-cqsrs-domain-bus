import type { AgentCallers } from './agent-callers';
import { PlatformCaller } from './platform-caller';

export class CallerBearerFetch {
  static of(callers: AgentCallers, base: typeof fetch = fetch): typeof fetch {
    return (input, init) => {
      const caller = callers.currentAs(PlatformCaller);
      if (!caller) return base(input, init);
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${caller.accessToken}`);
      return base(input, { ...init, headers });
    };
  }
}
