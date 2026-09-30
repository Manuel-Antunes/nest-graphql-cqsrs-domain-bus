import { A2aWire } from '../testing/a2a-wire';
import { A2aPart } from './a2a-part';
import { BaseExtension } from './extension';
import { ClientToolsExtension } from './extensions/client-tools.extension';
import { DeepAgentExtension } from './extensions/deep-agent.extension';

interface PingPayload {
  type: 'ping';
  at: number;
}

class PingExtension extends BaseExtension<PingPayload> {
  readonly name = 'ping';
  readonly version = 'v1';
  readonly description = 'Pings.';
  protected override readonly payloadTypes = ['ping'] as const;

  claimOn(carrier: { extensions: string[] }): void {
    this.claim(carrier);
  }
}

describe('BaseExtension', () => {
  it('addresses itself by a stage-independent, versioned URI', () => {
    expect(new PingExtension().uri).toBe(
      'https://github.com/Vaz-Innovation/vaz-twin/a2a/extensions/ping/v1',
    );
  });

  it('describes itself for the card as an optional extension', () => {
    expect(new PingExtension().descriptor).toEqual({
      uri: 'https://github.com/Vaz-Innovation/vaz-twin/a2a/extensions/ping/v1',
      description: 'Pings.',
      required: false,
      params: {},
    });
  });

  it('activates only when the caller asked, and records the activation', () => {
    const extension = new PingExtension();
    const asked = A2aWire.serverContext([extension.uri]);
    const silent = A2aWire.serverContext([]);

    expect(extension.activate(asked)).toBe(true);
    expect(asked.activatedExtensions).toEqual([extension.uri]);
    expect(extension.activate(silent)).toBe(false);
    expect(silent.activatedExtensions ?? []).toEqual([]);
  });

  it('reads a decision already taken without taking it again', () => {
    const extension = new PingExtension();

    expect(extension.isActivatedIn([extension.uri])).toBe(true);
    expect(extension.isActivatedIn(undefined)).toBe(false);
    expect(
      extension.isActivatedFor(
        A2aWire.requestContext(A2aWire.activated([extension.uri])),
      ),
    ).toBe(true);
  });

  it('round-trips its own payloads as data parts', () => {
    const extension = new PingExtension();
    const part = extension.encode({ type: 'ping', at: 1 });

    expect(part.content).toEqual({
      $case: 'data',
      value: { type: 'ping', at: 1 },
    });
    expect(extension.decode(part)).toEqual({ type: 'ping', at: 1 });
  });

  it('ignores payloads it does not own, and parts that are not data', () => {
    const extension = new PingExtension();

    expect(
      extension.decode(A2aPart.data({ type: 'tool-call' })),
    ).toBeUndefined();
    expect(extension.decode(A2aPart.data({ type: 7 }))).toBeUndefined();
    expect(extension.decode(A2aPart.data(null))).toBeUndefined();
    expect(extension.decode(A2aPart.text('ping'))).toBeUndefined();
  });

  it('decodes the payloads of the extensions it depends on', () => {
    const toolCall = new ClientToolsExtension().encode({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'write_todos',
      args: {},
      execution: 'server',
    });

    expect(new DeepAgentExtension().decode(toolCall)).toMatchObject({
      type: 'tool-call',
      toolName: 'write_todos',
    });
  });

  it('decodes every payload of a kind, or the first one', () => {
    const extension = new PingExtension();
    const parts = [
      extension.encode({ type: 'ping', at: 1 }),
      A2aPart.text('between'),
      extension.encode({ type: 'ping', at: 2 }),
    ];

    expect(extension.decodeAll(parts, 'ping').map((ping) => ping.at)).toEqual([
      1, 2,
    ]);
    expect(extension.decodeFirst(parts, 'ping')?.at).toBe(1);
    expect(extension.decodeFirst([], 'ping')).toBeUndefined();
  });

  it('claims a carrier once, however often it contributes', () => {
    const extension = new PingExtension();
    const message = A2aWire.message();

    extension.claimOn(message);
    extension.claimOn(message);

    expect(message.extensions).toEqual([extension.uri]);
  });
});
