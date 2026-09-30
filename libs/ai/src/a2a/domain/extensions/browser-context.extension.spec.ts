import { A2aWire } from '../../testing/a2a-wire';
import {
  BrowserContextExtension,
  type BrowserContextPayload,
} from './browser-context.extension';

const browserContext = new BrowserContextExtension();

const CONTEXT: BrowserContextPayload = {
  type: 'browser-context',
  current: {
    tabId: 1,
    url: 'https://app.example/clientes',
    title: 'Clientes',
    content: 'Ana Souza — 111.111.111-11',
    truncated: true,
  },
  others: [{ tabId: 2, url: 'https://docs.example/guia', title: 'Guia' }],
};

describe('BrowserContextExtension', () => {
  it('reads the page the caller is on, when it negotiated the extension', () => {
    const request = (activated: string[]) =>
      A2aWire.requestContext(A2aWire.activated(activated), {
        userMessage: A2aWire.message([browserContext.encode(CONTEXT)]),
      });

    expect(browserContext.contextFor(request([browserContext.uri]))).toEqual(
      CONTEXT,
    );
    expect(browserContext.contextFor(request([]))).toBeUndefined();
  });

  it('tells the model the page, and that the other tabs are only links', () => {
    const block = browserContext.render(CONTEXT);

    expect(block).toMatch(/^## Contexto do navegador/);
    expect(block).toContain('https://app.example/clientes');
    expect(block).toContain('Ana Souza');
    expect(block).toContain('https://docs.example/guia');
    expect(block).toContain('NÃO o conteúdo');
    expect(block).toContain('CORTADO');
  });

  it('says so when the current page could not be read', () => {
    expect(
      browserContext.render({
        type: 'browser-context',
        others: CONTEXT.others,
      }),
    ).toContain('Não foi possível ler a página atual');
  });

  it('says nothing at all when there is nothing to tell', () => {
    expect(browserContext.render(undefined)).toBe('');
    expect(browserContext.render({ type: 'browser-context', others: [] })).toBe(
      '',
    );
  });
});
