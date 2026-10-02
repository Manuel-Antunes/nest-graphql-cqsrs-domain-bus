import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from '@ag-ui/client';
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from '@copilotkit/runtime/v2';
import { Observable } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { CopilotKitRoutes } from './copilotkit-routes';

class EchoAgent extends AbstractAgent {
  run({ threadId, runId, messages }: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      subscriber.next({ type: EventType.RUN_STARTED, threadId, runId });
      subscriber.next({
        type: EventType.TEXT_MESSAGE_START,
        messageId: `answer-${runId}`,
        role: 'assistant',
      } as BaseEvent);
      subscriber.next({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: `answer-${runId}`,
        delta: `You said ${String(messages.at(-1)?.content)}`,
      } as BaseEvent);
      subscriber.next({
        type: EventType.TEXT_MESSAGE_END,
        messageId: `answer-${runId}`,
      } as BaseEvent);
      subscriber.next({ type: EventType.RUN_FINISHED, threadId, runId });
      subscriber.complete();
    });
  }
}

const BASE = '/api/copilotkit';
const at = (path: string, init?: RequestInit) =>
  new Request(`http://web.test${BASE}${path}`, init);
const post = (path: string, body: unknown) =>
  at(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const runInput = (threadId: string, runId: string, text: string) => ({
  threadId,
  runId,
  messages: [{ id: `user-${runId}`, role: 'user', content: text }],
  state: {},
  tools: [],
  context: [],
  forwardedProps: {},
});

describe("CopilotKit's runtime routes", () => {
  beforeAll(() => {
    vi.stubEnv('COPILOTKIT_TELEMETRY_DISABLED', 'true');
  });

  const runtimeWithOneConversation = async () => {
    const runtime = createCopilotRuntimeHandler({
      runtime: new CopilotRuntime({
        agents: { theo: new EchoAgent({ agentId: 'theo' }) },
      }),
      basePath: BASE,
    });
    const threadId = crypto.randomUUID();
    await (
      await runtime(post('/agent/theo/run', runInput(threadId, 'r1', 'Secret')))
    ).text();
    return { runtime, threadId };
  };

  it('list every conversation the runtime ran, whoever had it', async () => {
    const { runtime, threadId } = await runtimeWithOneConversation();

    const listed = await (await runtime(at('/threads?agentId=theo'))).text();

    expect(listed).toContain(threadId);
  });

  it('replay a conversation to whoever names its thread', async () => {
    const { runtime, threadId } = await runtimeWithOneConversation();

    const replayed = await (
      await runtime(post('/agent/theo/connect', runInput(threadId, 'r2', '')))
    ).text();

    expect(replayed).toContain('You said Secret');
  });

  it('are served only where the web talks to Theo: its info, a run and a stop', () => {
    expect(CopilotKitRoutes.isServed(at('/info'), BASE)).toBe(true);
    expect(CopilotKitRoutes.isServed(at('/agent/theo/run'), BASE)).toBe(true);
    expect(CopilotKitRoutes.isServed(at('/agent/theo/stop/t-1'), BASE)).toBe(
      true,
    );

    for (const path of [
      '/agent/theo/connect',
      '/agent/theo/suggest',
      '/threads',
      '/threads/t-1/messages',
      '/threads/t-1/events',
      '/threads/clear',
      '/memories',
      '/memories/recall',
      '/inspector-metadata',
      '/cpk-debug-events',
      '/transcribe',
      '/agent/theo/run/extra',
    ]) {
      expect(CopilotKitRoutes.isServed(at(path), BASE), path).toBe(false);
    }
  });
});
