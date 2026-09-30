import { A2aWire } from '../../testing/a2a-wire';
import { HumanInTheLoopExtension } from './human-in-the-loop.extension';

const hitl = new HumanInTheLoopExtension();

const pause = {
  actionRequests: [{ name: 'delete_client', args: { id: 1 } }],
  reviewConfigs: [
    { actionName: 'delete_client', allowedDecisions: ['approve', 'reject'] },
  ],
};

describe('HumanInTheLoopExtension', () => {
  it('recognises a pause by its shape, not by who raised it', () => {
    expect(hitl.isRequest(pause)).toBe(true);
    expect(hitl.isRequest({ clientTool: { name: 'x' } })).toBe(false);
    expect(hitl.isRequest(null)).toBe(false);
  });

  it('publishes each parked request under its own interrupt id', () => {
    expect(
      hitl.requestsParkedOn([
        { id: 'i1', value: pause },
        { id: 'i2', value: { clientTool: {} } },
        { id: 'i3', value: pause },
      ]),
    ).toEqual([
      { type: 'hitl-request', interruptId: 'i1', ...pause },
      { type: 'hitl-request', interruptId: 'i3', ...pause },
    ]);
  });

  it('reads the decisions a client answered with', () => {
    const answer = hitl.encode({
      type: 'hitl-response',
      interruptId: 'i1',
      decisions: [{ type: 'approve' }],
    });

    expect(
      hitl.responsesIn({ userMessage: A2aWire.message([answer]) }),
    ).toEqual([
      {
        type: 'hitl-response',
        interruptId: 'i1',
        decisions: [{ type: 'approve' }],
      },
    ]);
  });

  it('turns the reviews client tools declared into an interrupt policy', () => {
    const request = A2aWire.requestContext(A2aWire.activated([hitl.uri]));

    expect(
      hitl.interruptOnFor(request, [
        {
          name: 'delete_client',
          review: { allowedDecisions: ['approve', 'reject'] },
        },
        { name: 'navigate_to_page' },
        { name: 'dead_end', review: { allowedDecisions: [] } },
      ]),
    ).toEqual({ delete_client: { allowedDecisions: ['approve', 'reject'] } });
  });

  it('asks nothing of a caller that cannot answer', () => {
    const request = A2aWire.requestContext(A2aWire.activated([]));

    expect(
      hitl.interruptOnFor(request, [
        { name: 'delete_client', review: { allowedDecisions: ['approve'] } },
      ]),
    ).toBeUndefined();
  });

  it('declares no policy when no tool asked for review', () => {
    const request = A2aWire.requestContext(A2aWire.activated([hitl.uri]));
    expect(hitl.interruptOnFor(request, [{ name: 'x' }])).toBeUndefined();
  });

  it('claims the message that carries a pause', () => {
    const message = A2aWire.message([
      hitl.encode({
        type: 'hitl-request',
        interruptId: 'i1',
        ...pause,
      } as never),
    ]);
    hitl.decorateEvent({ kind: 'message', data: message });
    expect(message.extensions).toEqual([hitl.uri]);
  });
});
