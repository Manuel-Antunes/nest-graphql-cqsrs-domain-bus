import { TaskState } from '@a2a-js/sdk';

import { A2aWire } from '../testing/a2a-wire';
import { A2aPart } from './a2a-part';
import { AgentExtensions } from './agent-extensions';
import { MessageTimestampsExtension } from './extensions/message-timestamps.extension';

const extensions = new AgentExtensions();

describe('AgentExtensions', () => {
  it('declares every extension the agent implements, each one optional', () => {
    expect(extensions.uris().sort()).toEqual(
      [
        extensions.clientTools.uri,
        extensions.promptAugmentation.uri,
        extensions.deepAgent.uri,
        extensions.humanInTheLoop.uri,
        extensions.browserContext.uri,
        extensions.messageTimestamps.uri,
        extensions.a2ui.uri,
      ].sort(),
    );
    expect(
      extensions.descriptors().every((extension) => !extension.required),
    ).toBe(true);
  });

  it('anchors its own extensions to the repository and pins A2UI to the published one', () => {
    const own = extensions
      .all()
      .filter((extension) => extension !== extensions.a2ui);

    for (const extension of own) {
      expect(extension.uri).toMatch(
        /^https:\/\/github\.com\/Vaz-Innovation\/vaz-twin\/a2a\/extensions\/[a-z-]+\/v1$/,
      );
    }
    expect(extensions.a2ui.uri).toBe(
      'https://a2ui.org/a2a-extension/a2ui/v0.8',
    );
  });

  it('keeps extensions that promise different things apart', () => {
    expect(new Set(extensions.uris()).size).toBe(extensions.all().length);
  });

  it('narrows the card to what the skills declare, and declares all when they declare none', () => {
    const narrowed = extensions.descriptors(
      new Set([extensions.clientTools.uri]),
    );

    expect(narrowed.map((extension) => extension.uri)).toEqual([
      extensions.clientTools.uri,
    ]);
    expect(extensions.descriptors(new Set())).toHaveLength(
      extensions.all().length,
    );
  });

  it('activates, for a turn, every turn extension the caller requested and nothing else', () => {
    const context = A2aWire.serverContext([
      extensions.humanInTheLoop.uri,
      extensions.browserContext.uri,
      extensions.promptAugmentation.uri,
      'https://example.test/unknown/v1',
    ]);

    const active = extensions.activateForTurn(context);

    expect(active.map((extension) => extension.uri).sort()).toEqual(
      [
        extensions.humanInTheLoop.uri,
        extensions.browserContext.uri,
        extensions.promptAugmentation.uri,
      ].sort(),
    );
    expect([...(context.activatedExtensions ?? [])].sort()).toEqual(
      active.map((extension) => extension.uri).sort(),
    );
  });

  it('leaves message timestamps to the history read, which is the only place they exist', () => {
    const context = A2aWire.serverContext([extensions.messageTimestamps.uri]);

    expect(extensions.activateForTurn(context)).toEqual([]);
    expect(context.activatedExtensions ?? []).toEqual([]);
  });

  it('publishes tool events to a caller that negotiated client tools or deep agent', () => {
    const request = (uris: string[]) =>
      A2aWire.requestContext(A2aWire.activated(uris));

    expect(
      extensions.rendersToolEvents(request([extensions.clientTools.uri])),
    ).toBe(true);
    expect(
      extensions.rendersToolEvents(request([extensions.deepAgent.uri])),
    ).toBe(true);
    expect(
      extensions.rendersToolEvents(request([extensions.browserContext.uri])),
    ).toBe(false);
  });
});

describe('the standing metadata rule', () => {
  const declaredMetadataKeys = new Set([
    MessageTimestampsExtension.METADATA_KEY,
  ]);

  it('writes no metadata key outside a declared extension', () => {
    const message = A2aWire.message([A2aPart.text('olá')]);
    extensions.messageTimestamps.stamp(message, new Date());

    const keys = Object.keys(message.metadata ?? {});
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => declaredMetadataKeys.has(key))).toBe(true);
  });

  it('decorates nothing on a turn event that carries no payload of its own', () => {
    const message = A2aWire.message([A2aPart.text('olá')]);
    for (const extension of extensions.all()) {
      extension.decorateEvent({
        kind: 'statusUpdate',
        data: {
          taskId: 't1',
          contextId: 'c1',
          status: {
            state: TaskState.TASK_STATE_WORKING,
            message,
            timestamp: undefined,
          },
          metadata: undefined,
        },
      });
    }

    expect(message.extensions).toEqual([]);
    expect(message.metadata).toBeUndefined();
  });
});
