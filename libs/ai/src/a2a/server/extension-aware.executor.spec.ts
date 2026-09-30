import { TaskState } from '@a2a-js/sdk';
import type { AgentExecutionEvent, AgentExecutor } from '@a2a-js/sdk/server';

import { A2aPart } from '../domain/a2a-part';
import { AgentExtensions } from '../domain/agent-extensions';
import { A2aWire } from '../testing/a2a-wire';
import { ExtensionAwareAgentExecutor } from './extension-aware.executor';

const extensions = new AgentExtensions();

const publishing = (events: AgentExecutionEvent[]): AgentExecutor => ({
  execute: async (_context, bus) => {
    for (const event of events) bus.publish(event);
  },
  cancelTask: async () => undefined,
});

const toolCall = (toolName: string) =>
  A2aWire.message([
    extensions.clientTools.encode({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName,
      args: {},
      execution: 'client',
    }),
  ]);

describe('ExtensionAwareAgentExecutor', () => {
  it('hands the delegate the plain bus when nothing is activated', async () => {
    const bus = A2aWire.recordingBus();
    const message = toolCall('navigate_to_page');
    let seen: unknown;
    const executor = new ExtensionAwareAgentExecutor({
      execute: async (_context, received) => {
        seen = received;
        received.publish({ kind: 'message', data: message });
      },
      cancelTask: async () => undefined,
    });

    await executor.execute(
      A2aWire.requestContext(A2aWire.serverContext([])),
      bus,
    );

    expect(seen).toBe(bus);
    expect(bus.events).toHaveLength(1);
    expect(message.extensions).toEqual([]);
  });

  it('stamps the contributing extension when it is activated', async () => {
    const message = toolCall('navigate_to_page');
    const executor = new ExtensionAwareAgentExecutor(
      publishing([{ kind: 'message', data: message }]),
    );

    await executor.execute(
      A2aWire.requestContext(
        A2aWire.serverContext([extensions.clientTools.uri]),
      ),
      A2aWire.recordingBus(),
    );

    expect(message.extensions).toEqual([extensions.clientTools.uri]);
  });

  it('records activation, so the response header cannot disagree with what ran', async () => {
    const context = A2aWire.serverContext([extensions.clientTools.uri]);

    await new ExtensionAwareAgentExecutor(publishing([])).execute(
      A2aWire.requestContext(context),
      A2aWire.recordingBus(),
    );

    expect(context.activatedExtensions).toEqual([extensions.clientTools.uri]);
  });

  it('activates human-in-the-loop, browser context and prompt augmentation for the turn', async () => {
    const context = A2aWire.serverContext([
      extensions.humanInTheLoop.uri,
      extensions.browserContext.uri,
      extensions.promptAugmentation.uri,
    ]);
    let activatedDuringTheTurn: readonly string[] | undefined;
    const executor = new ExtensionAwareAgentExecutor({
      execute: async (request) => {
        activatedDuringTheTurn = request.context.activatedExtensions;
      },
      cancelTask: async () => undefined,
    });

    await executor.execute(
      A2aWire.requestContext(context),
      A2aWire.recordingBus(),
    );

    expect([...(activatedDuringTheTurn ?? [])].sort()).toEqual(
      [
        extensions.humanInTheLoop.uri,
        extensions.browserContext.uri,
        extensions.promptAugmentation.uri,
      ].sort(),
    );
  });

  it('does not activate an extension the caller did not request', async () => {
    const context = A2aWire.serverContext([extensions.clientTools.uri]);

    await new ExtensionAwareAgentExecutor(publishing([])).execute(
      A2aWire.requestContext(context),
      A2aWire.recordingBus(),
    );

    expect(context.activatedExtensions ?? []).not.toContain(
      extensions.deepAgent.uri,
    );
  });

  it('labels a deep-agent call only under its own extension', async () => {
    const plan = toolCall('write_todos');
    const executor = new ExtensionAwareAgentExecutor(
      publishing([
        {
          kind: 'statusUpdate',
          data: {
            taskId: 't1',
            contextId: 'c1',
            status: {
              state: TaskState.TASK_STATE_WORKING,
              message: plan,
              timestamp: undefined,
            },
            metadata: undefined,
          },
        },
      ]),
    );

    await executor.execute(
      A2aWire.requestContext(A2aWire.serverContext([extensions.deepAgent.uri])),
      A2aWire.recordingBus(),
    );

    expect(plan.extensions).toEqual([extensions.deepAgent.uri]);
  });

  it('forwards everything but publish verbatim, and delegates cancellation', async () => {
    const bus = A2aWire.recordingBus();
    const finished = vi.spyOn(bus, 'finished');
    const cancelTask = vi.fn(async () => undefined);
    const executor = new ExtensionAwareAgentExecutor({
      execute: async (_context, decorated) => {
        decorated.publish({
          kind: 'message',
          data: A2aWire.message([A2aPart.text('x')]),
        });
        decorated.finished();
      },
      cancelTask,
    });

    await executor.execute(
      A2aWire.requestContext(
        A2aWire.serverContext([extensions.clientTools.uri]),
      ),
      bus,
    );
    await executor.cancelTask('t1', bus);

    expect(bus.events).toHaveLength(1);
    expect(finished).toHaveBeenCalledOnce();
    expect(cancelTask).toHaveBeenCalledWith('t1', bus);
  });
});
