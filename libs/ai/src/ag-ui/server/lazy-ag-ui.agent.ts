import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { defer, type Observable, switchMap } from 'rxjs';

import { Lazy } from '../../agents/lazy';
import type { AgUiAgentFactory } from './ag-ui-agent.decorator';

export class LazyAgUiAgent extends AbstractAgent {
  private built: Lazy<AbstractAgent>;

  constructor(factory: AgUiAgentFactory) {
    super();
    this.built = new Lazy(factory);
  }

  static of(agent: AbstractAgent | AgUiAgentFactory): AbstractAgent {
    return typeof agent === 'function' ? new LazyAgUiAgent(agent) : agent;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return defer(() => this.built.get()).pipe(
      switchMap((agent) => agent.run(input)),
    );
  }

  override clone(): LazyAgUiAgent {
    const cloned = super.clone() as LazyAgUiAgent;
    cloned.built = this.built;
    return cloned;
  }
}
