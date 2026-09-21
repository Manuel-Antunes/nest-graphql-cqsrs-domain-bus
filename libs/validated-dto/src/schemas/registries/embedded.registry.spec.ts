import { z } from 'zod';
import { ValidatedDto } from '../../mixins/index';
import { createEmbeddedRegistry, EMBEDDED_REGISTRY, getEmbedded } from './embedded.registry';

describe('EMBEDDED_REGISTRY', () => {
  class Codigo extends ValidatedDto.Scalar(z.string().min(1).brand<'Codigo'>()) {}

  it('field() registra a classe concreta, e não a base gerada pelo mixin', () => {
    const binding = getEmbedded(Codigo.field());

    expect(binding).toEqual({ kind: 'scalar', target: Codigo });
  });

  it('um schema ausente não tem vínculo nenhum', () => {
    expect(getEmbedded(undefined)).toBeUndefined();
  });

  it('um schema que nunca passou por field() também não tem vínculo', () => {
    expect(getEmbedded(z.string())).toBeUndefined();
  });

  it('um registry isolado cai no global para o que ele não conhece', () => {
    const isolado = createEmbeddedRegistry();
    const doGlobal = Codigo.field();

    expect(getEmbedded(doGlobal, isolado)).toEqual({ kind: 'scalar', target: Codigo });
  });

  it('o que está no registry isolado é lido de lá, sem passar pelo global', () => {
    const isolado = createEmbeddedRegistry();
    const schema = z.string();
    isolado.add(schema, { kind: 'object', target: Codigo });

    expect(getEmbedded(schema, isolado)).toEqual({ kind: 'object', target: Codigo });
    expect(getEmbedded(schema)).toBeUndefined();
  });

  it('o registry global é o padrão de leitura', () => {
    expect(getEmbedded(Codigo.field(), EMBEDDED_REGISTRY)).toEqual(getEmbedded(Codigo.field()));
  });
});
