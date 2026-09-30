import { TaskState } from '@a2a-js/sdk';

import { A2aWire } from '../../testing/a2a-wire';
import { A2aPart } from '../a2a-part';
import { ClientToolsExtension } from './client-tools.extension';

const clientTools = new ClientToolsExtension();

const declaration = clientTools.encode({
  type: 'client-tools',
  tools: [
    {
      name: 'navigate_to_page',
      description: 'go',
      parameters: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', additionalProperties: false },
          filters: { type: 'array', items: [{ $schema: 'x', type: 'string' }] },
        },
      },
      review: { allowedDecisions: ['approve', 'reject'] },
    },
  ],
});

const turn = (activated: string[], parts = [declaration], task?: unknown) =>
  A2aWire.requestContext(A2aWire.activated(activated), {
    userMessage: A2aWire.message(parts),
    task: task as never,
  });

describe('ClientToolsExtension', () => {
  it('reads the declared tools, stripping the schema keys providers reject', () => {
    expect(clientTools.toolsDeclaredFor(turn([clientTools.uri]))).toEqual([
      {
        name: 'navigate_to_page',
        description: 'go',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            filters: { type: 'array', items: [{ type: 'string' }] },
          },
        },
        review: { allowedDecisions: ['approve', 'reject'] },
      },
    ]);
  });

  it('declares no tool to a caller that did not activate the extension', () => {
    expect(clientTools.toolsDeclaredFor(turn([]))).toEqual([]);
  });

  it('falls back to the task’s message when the turn only resumes it', () => {
    const task = {
      status: {
        state: TaskState.TASK_STATE_INPUT_REQUIRED,
        message: A2aWire.message([declaration]),
      },
    };

    expect(
      clientTools
        .toolsDeclaredFor(turn([clientTools.uri], [A2aPart.text('ok')], task))
        .map((tool) => tool.name),
    ).toEqual(['navigate_to_page']);
  });

  it('reads the results the browser returned', () => {
    const result = clientTools.encode({
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'navigate_to_page',
      result: 'ok',
      isError: true,
    });

    expect(
      clientTools.resultsIn({
        userMessage: A2aWire.message([A2aPart.text('x'), result]),
      }),
    ).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'navigate_to_page',
        result: 'ok',
        isError: true,
      },
    ]);
  });

  it('claims every message that carries one of its payloads, and only those', () => {
    const call = A2aWire.message([
      clientTools.encode({
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'navigate_to_page',
        args: {},
        execution: 'client',
      }),
    ]);
    const prose = A2aWire.message([A2aPart.text('oi')]);

    clientTools.decorateEvent({ kind: 'message', data: call });
    clientTools.decorateEvent({
      kind: 'statusUpdate',
      data: {
        taskId: 't1',
        contextId: 'c1',
        status: {
          state: TaskState.TASK_STATE_WORKING,
          message: prose,
          timestamp: undefined,
        },
        metadata: undefined,
      },
    });

    expect(call.extensions).toEqual([clientTools.uri]);
    expect(prose.extensions).toEqual([]);
  });

  it('lists the page tools for the model, exactly as named', () => {
    const prompt = clientTools.promptFor([
      { name: 'add_judgment_creditor', description: 'adds one' },
    ]);

    expect(prompt).toMatch(/^## Ferramentas da página atual/);
    expect(prompt).toContain('`add_judgment_creditor`: adds one');
    expect(prompt).toContain('NUNCA invente nomes de ferramentas');
  });

  it('points the model at navigation when the page registered no tools', () => {
    expect(clientTools.promptFor([])).toContain('navigate_to_page');
  });
});
