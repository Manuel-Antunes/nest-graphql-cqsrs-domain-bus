import { A2aWire } from '../../testing/a2a-wire';
import { ClientToolsExtension } from './client-tools.extension';
import { DeepAgentExtension } from './deep-agent.extension';

const clientTools = new ClientToolsExtension();
const deepAgent = new DeepAgentExtension();

const callOf = (toolName: string) =>
  A2aWire.message([
    clientTools.encode({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName,
      args: {},
      execution: 'server',
    }),
  ]);

describe('DeepAgentExtension', () => {
  it.each(['write_todos', 'task', 'ask_user', 'review_action'])(
    'claims the %s call, which it declares',
    (toolName) => {
      const message = callOf(toolName);
      deepAgent.decorateEvent({ kind: 'message', data: message });
      expect(message.extensions).toEqual([deepAgent.uri]);
    },
  );

  it('leaves a page tool to client tools', () => {
    const message = callOf('navigate_to_page');
    deepAgent.decorateEvent({ kind: 'message', data: message });
    expect(message.extensions).toEqual([]);
  });

  it('claims a plan update, its own payload', () => {
    const message = A2aWire.message([
      deepAgent.encode({
        type: 'plan-update',
        todos: [{ content: 'ler', status: 'pending' }],
      }),
    ]);
    deepAgent.decorateEvent({ kind: 'message', data: message });
    expect(message.extensions).toEqual([deepAgent.uri]);
  });

  it('ignores events that carry no message', () => {
    expect(() =>
      deepAgent.decorateEvent({
        kind: 'task',
        data: {} as never,
      }),
    ).not.toThrow();
  });
});
