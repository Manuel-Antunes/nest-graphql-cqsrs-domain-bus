import type { AgentExecutionEvent, RequestContext } from '@a2a-js/sdk/server';

import { BaseExtension } from '../extension';
import type { ClientToolDeclaration } from './client-tools.extension';

export interface HitlActionRequest {
  name: string;
  args: Record<string, unknown>;
  description?: string;
}

export interface HitlReviewConfig {
  actionName: string;
  allowedDecisions: ('approve' | 'edit' | 'reject')[];
  argsSchema?: Record<string, unknown>;
}

export type HitlReviewPolicy = Omit<HitlReviewConfig, 'actionName'>;

export type HitlDecision =
  | { type: 'approve' }
  | {
      type: 'edit';
      editedAction: { name: string; args: Record<string, unknown> };
    }
  | { type: 'reject'; message?: string };

export interface HitlRequestPayload {
  type: 'hitl-request';
  interruptId: string;
  actionRequests: HitlActionRequest[];
  reviewConfigs: HitlReviewConfig[];
}

export interface HitlResponsePayload {
  type: 'hitl-response';
  interruptId: string;
  decisions: HitlDecision[];
}

export interface ParkedInterrupt {
  id: string;
  value?: unknown;
}

export class HumanInTheLoopExtension extends BaseExtension<
  HitlRequestPayload | HitlResponsePayload
> {
  readonly name = 'human-in-the-loop';
  readonly version = 'v1';
  readonly description =
    'Human-in-the-loop: the agent parks on an interrupt, the client answers with a decision (approve / edit / reject), the graph resumes.';
  protected override readonly payloadTypes = [
    'hitl-request',
    'hitl-response',
  ] as const;

  override decorateEvent(event: AgentExecutionEvent): void {
    const message = this.messageOf(event);
    if (message && this.carries(message, () => true)) this.claim(message);
  }

  isRequest(
    value: unknown,
  ): value is Pick<HitlRequestPayload, 'actionRequests' | 'reviewConfigs'> {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      Array.isArray(candidate.actionRequests) &&
      Array.isArray(candidate.reviewConfigs)
    );
  }

  requestsParkedOn(
    interrupts: readonly ParkedInterrupt[],
  ): HitlRequestPayload[] {
    return interrupts.flatMap((pause) =>
      this.isRequest(pause.value)
        ? [
            {
              type: 'hitl-request' as const,
              interruptId: pause.id,
              actionRequests: pause.value.actionRequests,
              reviewConfigs: pause.value.reviewConfigs,
            },
          ]
        : [],
    );
  }

  responsesIn(
    request: Pick<RequestContext, 'userMessage'>,
  ): HitlResponsePayload[] {
    return this.decodeAll(request.userMessage.parts, 'hitl-response');
  }

  interruptOnFor(
    request: Pick<RequestContext, 'context'>,
    tools: readonly ClientToolDeclaration[],
  ): Record<string, HitlReviewPolicy> | undefined {
    if (!this.isActivatedFor(request)) return undefined;

    const policy: Record<string, HitlReviewPolicy> = {};
    for (const tool of tools) {
      if (tool.review?.allowedDecisions?.length) {
        policy[tool.name] = tool.review;
      }
    }
    return Object.keys(policy).length > 0 ? policy : undefined;
  }
}
