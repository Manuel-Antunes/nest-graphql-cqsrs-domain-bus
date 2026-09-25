import { MarkdownText } from './markdown-text';

describe('MarkdownText', () => {
  it('splits a Polar description into its prose and its list, without the syntax', () => {
    expect(
      MarkdownText.split(
        '**Contatos:** 500 no ciclo · **Tokens Vaz:** 5.000 por mês\n\n- 1 Gêmeo Digital treinado no seu negócio\n- Canais: WhatsApp, Instagram e site\n- Suporte por e-mail',
      ),
    ).toEqual({
      prose: 'Contatos: 500 no ciclo · Tokens Vaz: 5.000 por mês',
      items: [
        '1 Gêmeo Digital treinado no seu negócio',
        'Canais: WhatsApp, Instagram e site',
        'Suporte por e-mail',
      ],
    });
  });

  it('keeps the text of links, code and headings, and joins prose across lines', () => {
    expect(
      MarkdownText.split(
        '# Pro\nEverything in [Starter](https://example.com), plus `webhooks`.\n\n1. *Priority* support',
      ),
    ).toEqual({
      prose: 'Pro Everything in Starter, plus webhooks.',
      items: ['Priority support'],
    });
  });

  it('leaves plain text and snake_case words alone', () => {
    expect(MarkdownText.inline('Up to 3 projects with api_keys')).toBe(
      'Up to 3 projects with api_keys',
    );
  });
});
