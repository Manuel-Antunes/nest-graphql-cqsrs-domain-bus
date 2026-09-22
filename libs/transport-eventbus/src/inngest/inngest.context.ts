import { BaseRpcContext } from '@nestjs/microservices';
import type { EventPayload, GetStepTools, Inngest } from 'inngest';

export type InngestStepTools = GetStepTools<Inngest.Any>;

type InngestContextArgs = [
  event: EventPayload,
  pattern: string,
  step: InngestStepTools,
  runId: string,
  attempt: number,
];

/**
 * **What a handler can ask about the run it is inside.** The counterpart of `SqsContext` and
 * `RmqContext`: the message as it arrived, the pattern that matched it, and the things only this
 * transport has — the step tools, the run, the attempt Inngest is on.
 */
export class InngestContext extends BaseRpcContext<InngestContextArgs> {
  getEvent(): EventPayload {
    return this.args[0];
  }

  getPattern(): string {
    return this.args[1];
  }

  /** Inngest's step tools, for a handler that wants `step.run`, `step.sleep` or `step.waitForEvent`. */
  getStep(): InngestStepTools {
    return this.args[2];
  }

  getRunId(): string {
    return this.args[3];
  }

  /** Zero on the first delivery. Inngest owns the retrying; this is only how to read where it is. */
  getAttempt(): number {
    return this.args[4];
  }

  getEventId(): string | undefined {
    return this.args[0].id;
  }
}
