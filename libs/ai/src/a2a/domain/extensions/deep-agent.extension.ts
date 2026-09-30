import type { AgentExecutionEvent } from '@a2a-js/sdk/server';

import { BaseExtension } from '../extension';
import { ClientToolsExtension } from './client-tools.extension';

export interface PlanUpdatePayload {
  type: 'plan-update';
  todos: { content: string; status: string }[];
}

export class DeepAgentExtension extends BaseExtension<
  PlanUpdatePayload,
  readonly [typeof ClientToolsExtension]
> {
  static readonly TOOLS: ReadonlySet<string> = new Set([
    'write_todos',
    'task',
    'ask_user',
    'review_action',
  ]);

  readonly name = 'deep-agent';
  readonly version = 'v1';
  readonly description =
    'Deep-agent signals: todo plans and sub-agent delegation.';
  override readonly dependencies = [ClientToolsExtension] as const;
  protected override readonly payloadTypes = ['plan-update'] as const;

  override decorateEvent(event: AgentExecutionEvent): void {
    const message = this.messageOf(event);
    if (!message) return;
    const delegates = this.carries(
      message,
      (payload) =>
        payload.type === 'plan-update' ||
        ((payload.type === 'tool-call' || payload.type === 'tool-result') &&
          DeepAgentExtension.TOOLS.has(payload.toolName)),
    );
    if (delegates) this.claim(message);
  }
}
