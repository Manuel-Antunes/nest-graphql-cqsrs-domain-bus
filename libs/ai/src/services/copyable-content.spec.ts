import { describe, expect, it } from 'vitest';

import { extractCopyableContent, hasCopyableContent } from './copyable-content';

describe('hasCopyableContent', () => {
  it.each([
    ['e-mail', 'me confirma em joao@email.com.br'],
    ['CPF', 'seu CPF e 123.456.789-00'],
    ['CNPJ', 'o CNPJ e 12.345.678/0001-90'],
    ['CNJ', 'processo 0005672-23.2011.4.01.3400'],
    ['phone', 'ligue no (11) 99999-8888'],
    ['url', 'acesse https://exemplo.com/x'],
    ['money with separators', 'valor de R$ 4.294.085,58'],
    ['long number / protocol', 'protocolo 4567890'],
  ])('detects %s', (_label, text) => {
    expect(hasCopyableContent(text)).toBe(true);
  });

  it.each([
    'Seu processo esta em fase de cumprimento de sentenca, sem novidades.',
    'cerca de quatro milhoes e duzentos mil reais',
    'distribuido em marco de 2023',
    '',
    undefined,
    null,
  ])('returns false for spoken-only text: %s', (text) => {
    expect(hasCopyableContent(text)).toBe(false);
  });
});

describe('extractCopyableContent', () => {
  it('pulls a CNJ out of an otherwise spoken sentence', () => {
    const { stripped, tokens } = extractCopyableContent(
      'Identifiquei seu processo, o numero e 0005672-23.2011.4.01.3400 e segue em andamento.',
    );
    expect(tokens).toEqual(['0005672-23.2011.4.01.3400']);
    expect(stripped).not.toContain('0005672');
    // The spoken remainder is tidied (no doubled spaces / dangling punctuation).
    expect(stripped).not.toMatch(/ {2,}/);
  });

  it('extracts multiple distinct tokens and de-dups', () => {
    const { tokens } = extractCopyableContent(
      'CPF 123.456.789-00, email joao@x.com, de novo 123.456.789-00',
    );
    expect(tokens).toEqual(['123.456.789-00', 'joao@x.com']);
  });

  it('is a no-op for spoken-only content', () => {
    const text = 'Esse processo esta na 1a Vara Federal, sem novidades hoje.';
    const { stripped, tokens } = extractCopyableContent(text);
    expect(tokens).toEqual([]);
    expect(stripped).toBe(text);
  });

  it('leaves an approximate spoken money value alone', () => {
    const { tokens } = extractCopyableContent(
      'no valor de cerca de quatro milhoes e duzentos mil reais',
    );
    expect(tokens).toEqual([]);
  });
});
