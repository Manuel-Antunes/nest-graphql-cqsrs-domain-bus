import { A2aWire } from '../../testing/a2a-wire';
import { A2aPart } from '../a2a-part';
import { MessageTimestampsExtension } from './message-timestamps.extension';

const timestamps = new MessageTimestampsExtension();

describe('MessageTimestampsExtension', () => {
  it('stamps the checkpoint time and claims the message', () => {
    const message = A2aWire.message([A2aPart.text('olá')], {
      metadata: { a: 1 },
    });
    const at = new Date('2020-01-01T00:00:00.000Z');

    timestamps.stamp(message, at);

    expect(message.metadata).toEqual({ a: 1, timestamp: at.toISOString() });
    expect(message.extensions).toEqual([timestamps.uri]);
  });

  it('leaves a message with no known time untouched', () => {
    const message = A2aWire.message();

    timestamps.stamp(message, undefined);

    expect(message.metadata).toBeUndefined();
    expect(message.extensions).toEqual([]);
  });
});
