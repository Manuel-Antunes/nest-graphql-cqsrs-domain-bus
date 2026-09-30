import { type AgentCard, AgentCard as AgentCardCodec } from '@a2a-js/sdk';
import { describe, expect, it } from 'vitest';

/**
 * The card as it goes ON THE WIRE.
 *
 * This exists because a passing test suite and a working `curl` both agreed the
 * card was fine while every real client refused it. The reason is that both
 * sides of that check spoke the same dialect: the server serialized its
 * in-memory card with `JSON.stringify`, and the assertions read it back with our
 * own parser, which understands the in-memory shape. The A2A SDK does not.
 *
 * v1.0 is proto-derived, so a oneof is encoded with the MEMBER NAME as the key.
 * `$case`/`value` is ts-proto's in-memory modelling of that union and is not
 * part of the protocol — publishing it produces a card only we can read.
 *
 * So these assert against the SDK's own codec, which is the only arbiter that is
 * not us.
 */

const CARD = {
  name: 'Test Agent',
  description: 'An agent under test.',
  version: '1.0.0',
  supportedInterfaces: [
    {
      url: 'https://agent.test/a2a/v1/jsonrpc',
      protocolBinding: 'JSONRPC',
      tenant: '',
      protocolVersion: '1.0',
    },
  ],
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extendedAgentCard: false,
    extensions: [],
  },
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [],
  signatures: [],
  documentationUrl: '',
  securitySchemes: {
    session: {
      scheme: {
        $case: 'apiKeySecurityScheme' as const,
        value: { description: 's', location: 'cookie', name: 'sid' },
      },
    },
    oauth: {
      scheme: {
        $case: 'oauth2SecurityScheme' as const,
        value: {
          description: 'o',
          oauth2MetadataUrl: 'https://issuer.test/.well-known/x',
          flows: {
            flow: {
              $case: 'authorizationCode' as const,
              value: {
                authorizationUrl: 'https://issuer.test/authorize',
                tokenUrl: 'https://issuer.test/token',
                refreshUrl: 'https://issuer.test/token',
                pkceRequired: true,
                scopes: { openid: 'id' },
              },
            },
          },
        },
      },
    },
  },
  securityRequirements: [
    { schemes: { session: { list: [] } } },
    { schemes: { oauth: { list: ['openid'] } } },
  ],
} as unknown as AgentCard;

/** What a client actually receives. */
const wire = JSON.parse(JSON.stringify(AgentCardCodec.toJSON(CARD)));

describe('the encoded agent card', () => {
  it('discriminates a security scheme by member name, not by $case', () => {
    // The exact defect: `$case` on the wire meant `SecurityScheme.fromJSON`
    // found no member it recognised and left `scheme` undefined, so the client
    // reported "requires an authentication method it does not understand" and
    // sent no credential at all.
    expect(wire.securitySchemes.oauth).toHaveProperty('oauth2SecurityScheme');
    expect(wire.securitySchemes.session).toHaveProperty('apiKeySecurityScheme');
    expect(JSON.stringify(wire)).not.toContain('$case');
  });

  it('encodes the oauth flow the same way', () => {
    expect(
      wire.securitySchemes.oauth.oauth2SecurityScheme.flows,
    ).toHaveProperty('authorizationCode');
  });

  it('survives the round trip a real client performs', () => {
    // The only check that means anything: decode with the SDK, the way every
    // client does, and confirm the values come back.
    const decoded = AgentCardCodec.fromJSON(wire);

    expect(decoded.securitySchemes?.oauth?.scheme?.$case).toBe(
      'oauth2SecurityScheme',
    );
    expect(decoded.securitySchemes?.session?.scheme?.$case).toBe(
      'apiKeySecurityScheme',
    );
  });

  it('keeps the session scheme first, so a signed-in caller needs no ceremony', () => {
    // OpenAPI semantics: satisfy ANY alternative. Order is the preference, and
    // a client takes the first one it can meet.
    expect(Object.keys(wire.securityRequirements[0].schemes)).toEqual([
      'session',
    ]);
  });

  it('still carries no `kind` anywhere', () => {
    expect(JSON.stringify(wire)).not.toContain('"kind"');
  });
});
