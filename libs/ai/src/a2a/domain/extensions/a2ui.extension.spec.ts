import { A2aWire } from '../../testing/a2a-wire';
import { A2aPart } from '../a2a-part';
import { A2uiExtension } from './a2ui.extension';

const TREE = {
  surfaceUpdate: {
    surfaceId: 's1',
    components: [
      { id: 'root', component: { McpApp: { htmlContent: { path: '/html' } } } },
    ],
  },
};

const a2ui = new A2uiExtension();

describe('A2uiExtension', () => {
  it('pins the published URI, mime type and catalog verbatim', () => {
    expect(a2ui.uri).toBe('https://a2ui.org/a2a-extension/a2ui/v0.8');
    expect(A2uiExtension.MIME_TYPE).toBe('application/json+a2ui');
    expect(A2uiExtension.MCP_APP_CATALOG_ID).toBe(
      'a2ui.org:a2ui/v0.8/mcp_app_catalog.json',
    );
  });

  it('round-trips a payload through a part', () => {
    const part = a2ui.part(TREE);

    expect(a2ui.isPart(part)).toBe(true);
    expect(a2ui.dataOf(part)).toEqual(TREE);
  });

  it('writes the mime type in the part metadata, not in mediaType', () => {
    const part = a2ui.part(TREE);

    expect(part.metadata).toEqual({ mimeType: A2uiExtension.MIME_TYPE });
    expect(part.mediaType).toBe('application/json');
  });

  it('refuses a part that only claims the mime type in mediaType', () => {
    expect(
      a2ui.isPart({
        ...A2aPart.data(TREE),
        mediaType: A2uiExtension.MIME_TYPE,
      }),
    ).toBe(false);
  });

  it('refuses our own payloads and a text part carrying the metadata', () => {
    expect(a2ui.isPart(A2aPart.data({ type: 'tool-call' }))).toBe(false);
    expect(a2ui.isPart(A2aPart.text('oi'))).toBe(false);
    expect(
      a2ui.isPart({
        ...A2aPart.text('oi'),
        metadata: { mimeType: A2uiExtension.MIME_TYPE },
      }),
    ).toBe(false);
    expect(a2ui.dataOf(A2aPart.text('oi'))).toBeUndefined();
  });

  it('describes itself on the card with no params by default', () => {
    expect(a2ui.descriptor).toEqual({
      uri: 'https://a2ui.org/a2a-extension/a2ui/v0.8',
      description: 'Provides agent driven UI using the A2UI JSON format.',
      required: false,
      params: {},
    });
  });

  it('states inline catalogs and supported catalogs only when they are true', () => {
    expect(
      new A2uiExtension({
        acceptsInlineCustomCatalog: true,
        supportedCatalogIds: [A2uiExtension.MCP_APP_CATALOG_ID],
      }).params,
    ).toEqual({
      acceptsInlineCatalogs: true,
      supportedCatalogIds: [A2uiExtension.MCP_APP_CATALOG_ID],
    });
    expect(
      new A2uiExtension({
        acceptsInlineCustomCatalog: false,
        supportedCatalogIds: [],
      }).params,
    ).toEqual({});
  });

  it('announces the standard and MCP App catalogs by default', () => {
    expect(a2ui.clientCapabilities()).toEqual({
      supportedCatalogIds: [
        A2uiExtension.STANDARD_CATALOG_ID,
        A2uiExtension.MCP_APP_CATALOG_ID,
      ],
    });
  });

  it('stamps the capabilities on a message without dropping its metadata', () => {
    const stamped = a2ui.withClientCapabilities(
      A2aWire.message([], { metadata: { other: 1 } }),
    );

    expect(stamped.metadata).toEqual({
      other: 1,
      [A2uiExtension.CLIENT_CAPABILITIES_KEY]: a2ui.clientCapabilities(),
    });
    expect(a2ui.clientCapabilitiesOf(stamped)).toEqual(
      a2ui.clientCapabilities(),
    );
    expect(a2ui.clientCapabilitiesOf(A2aWire.message())).toBeUndefined();
  });

  it('claims the message that carries a rendered surface', () => {
    const surface = A2aWire.message([a2ui.part(TREE)]);
    const prose = A2aWire.message([A2aPart.text('oi')]);

    a2ui.decorateEvent({ kind: 'message', data: surface });
    a2ui.decorateEvent({ kind: 'message', data: prose });

    expect(surface.extensions).toEqual([a2ui.uri]);
    expect(prose.extensions).toEqual([]);
  });
});
