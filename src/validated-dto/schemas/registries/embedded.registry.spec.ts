import { z } from 'zod';
import { ValidatedDto } from '../../mixins';
import { createEmbeddedRegistry, EMBEDDED_REGISTRY, getEmbedded } from './embedded.registry';

/**
 * O registro que liga **o schema de um campo** à classe de value object que ele materializa.
 *
 * Quem o popula é o `VO.field()`, nunca uma escrita à mão: o `field()` é estático, então o `this`
 * dele já é a classe **concreta** — é isso que faz `PostId` ficar registrada, e não a base anônima que
 * o mixin gerou. O `getEmbedded` é a leitura desse vínculo, e ele tolera três coisas que acontecem de
 * verdade: um schema ausente, um schema de outra origem, e um registry isolado que precisa cair no
 * global porque um mesmo DTO pode misturar campos dos dois.
 */
describe('EMBEDDED_REGISTRY', () => {
  class Codigo extends ValidatedDto.Scalar(z.string().min(1).brand<'Codigo'>()) {}

  it('field() registra a classe concreta, e não a base gerada pelo mixin', () => {
    // Arrange / Act
    const binding = getEmbedded(Codigo.field());

    // Assert
    expect(binding).toEqual({ kind: 'scalar', target: Codigo });
  });

  /** Um campo pode nem existir no shape: perguntar por ele é `undefined`, não um erro. */
  it('um schema ausente não tem vínculo nenhum', () => {
    // Assert
    expect(getEmbedded(undefined)).toBeUndefined();
  });

  it('um schema que nunca passou por field() também não tem vínculo', () => {
    // Assert
    expect(getEmbedded(z.string())).toBeUndefined();
  });

  /**
   * Um registry isolado não substitui o global: um DTO pode ter campos registrados nos dois, e a
   * leitura precisa achar os dois. É por isso que a busca cai no global quando o isolado não sabe.
   */
  it('um registry isolado cai no global para o que ele não conhece', () => {
    // Arrange
    const isolado = createEmbeddedRegistry();
    const doGlobal = Codigo.field();

    // Act / Assert
    expect(getEmbedded(doGlobal, isolado)).toEqual({ kind: 'scalar', target: Codigo });
  });

  it('o que está no registry isolado é lido de lá, sem passar pelo global', () => {
    // Arrange
    const isolado = createEmbeddedRegistry();
    const schema = z.string();
    isolado.add(schema, { kind: 'object', target: Codigo });

    // Assert
    expect(getEmbedded(schema, isolado)).toEqual({ kind: 'object', target: Codigo });
    // e o global continua sem saber dele
    expect(getEmbedded(schema)).toBeUndefined();
  });

  it('o registry global é o padrão de leitura', () => {
    // Assert
    expect(getEmbedded(Codigo.field(), EMBEDDED_REGISTRY)).toEqual(getEmbedded(Codigo.field()));
  });
});
