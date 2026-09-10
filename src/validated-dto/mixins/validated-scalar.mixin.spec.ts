import 'reflect-metadata';

import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  createDecoratorRegistry,
  DECORATOR_REGISTRY,
} from '../schemas/registries/decorators.registry';
import { getEmbedded } from '../schemas/registries/embedded.registry';
import { InheritValidatedMetadata } from './validated-dto.mixin';
import {
  isScalarValueObject,
  rawScalarValue,
  ValidatedScalar,
  ZodScalarValidator,
} from './validated-scalar.mixin';

const PostTitleSchema = z
  .string({ error: 'title não pode ser vazio' })
  .trim()
  .min(1, 'title não pode ser vazio')
  .max(200, 'title excede 200 caracteres')
  .brand<'PostTitle'>();

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email('email inválido')).brand<'Email'>();

class PostTitle extends ValidatedScalar(PostTitleSchema) {
  isQuestion(): boolean {
    return this.value.endsWith('?');
  }
}

class Email extends ValidatedScalar(EmailSchema) {
  get domain(): string {
    return this.value.split('@')[1];
  }
}

describe('ValidatedDto.Scalar', () => {
  describe('Construção e normalização', () => {
    it('guarda o valor já normalizado pelo schema', () => {
      // Arrange / Act
      const title = new PostTitle('   Nest + GraphQL   ');

      // Assert
      expect(title.value).toBe('Nest + GraphQL');
    });

    it('aplica toda a cadeia de transformação do schema', () => {
      // Arrange / Act
      const email = new Email('  Manuel@Example.COM ');

      // Assert
      expect(email.value).toBe('manuel@example.com');
    });

    it('aceita outro value object como entrada (desembrulha)', () => {
      // Arrange
      const original = new PostTitle('Olá');

      // Act
      const copy = new PostTitle(original);

      // Assert
      expect(copy.value).toBe('Olá');
      expect(copy).not.toBe(original);
    });

    it('guarda o valor cru quando ele é inválido, em vez de lançar', () => {
      // Arrange / Act
      const title = new PostTitle('   ');

      // Assert
      expect(title.value).toBe('   ');
      expect(title.isValid()).toBe(false);
    });

    it('lança no construtor quando a classe é strict', () => {
      // Arrange
      class StrictTitle extends ValidatedScalar(PostTitleSchema, { strict: true }) {}

      // Act / Assert
      expect(() => new StrictTitle('')).toThrow(z.ZodError);
      expect(() => new StrictTitle('ok')).not.toThrow();
    });
  });

  describe('O value object é o valor', () => {
    it('toString devolve o texto', () => {
      // Arrange
      const title = new PostTitle('Olá');

      // Act / Assert
      expect(title.toString()).toBe('Olá');
      expect(`${title}`).toBe('Olá');
      expect(String(title)).toBe('Olá');
    });

    it('valueOf e toJSON devolvem o valor cru', () => {
      // Arrange
      const title = new PostTitle('Olá');

      // Act / Assert
      expect(title.valueOf()).toBe('Olá');
      expect(title.toJSON()).toBe('Olá');
      expect(JSON.stringify({ title })).toBe('{"title":"Olá"}');
    });

    it('participa de comparações e concatenações como o valor cru', () => {
      // Arrange
      const title = new PostTitle('Olá');

      // Act / Assert
      // eslint-disable-next-line eqeqeq
      expect(title == ('Olá' as any)).toBe(true);
      expect(title + '!').toBe('Olá!');
    });

    it('converte números pelo hint numérico', () => {
      // Arrange
      class Score extends ValidatedScalar(z.number().min(0).brand<'Score'>()) {}
      const score = new Score(42);

      // Act / Assert
      expect(Number(score)).toBe(42);
      expect((score as any) + 1).toBe(43);
      expect(score > (41 as any)).toBe(true);
    });

    it('serializa datas como ISO no toString e mantém o Date no valor', () => {
      // Arrange
      class OccurredAt extends ValidatedScalar(z.coerce.date().brand<'OccurredAt'>()) {}
      const occurredAt = new OccurredAt('2024-01-15T10:30:00.000Z');

      // Act / Assert
      expect(occurredAt.value).toBeInstanceOf(Date);
      expect(occurredAt.toString()).toBe('2024-01-15T10:30:00.000Z');
      expect(JSON.stringify({ occurredAt })).toBe('{"occurredAt":"2024-01-15T10:30:00.000Z"}');
      expect(Number(occurredAt)).toBe(Date.parse('2024-01-15T10:30:00.000Z'));
    });

    it('imprime legível no console', () => {
      // Arrange
      const title = new PostTitle('Olá');

      // Act / Assert
      expect(inspect(title)).toBe('PostTitle("Olá")');
    });
  });

  describe('Igualdade de valor', () => {
    it('duas instâncias com o mesmo valor são iguais', () => {
      // Arrange / Act / Assert
      expect(new PostTitle('Olá').equals(new PostTitle('Olá'))).toBe(true);
      expect(new PostTitle('Olá').equals(new PostTitle('Tchau'))).toBe(false);
    });

    it('compara com o valor cru', () => {
      // Arrange / Act / Assert
      expect(new PostTitle('Olá').equals('Olá')).toBe(true);
      expect(new PostTitle('Olá').equals(null)).toBe(false);
      expect(new PostTitle('Olá').equals(undefined)).toBe(false);
    });

    it('value objects de famílias diferentes nunca são iguais', () => {
      // Arrange
      class Slug extends ValidatedScalar(z.string().brand<'Slug'>()) {}
      class Handle extends ValidatedScalar(z.string().brand<'Handle'>()) {}

      // Act / Assert
      expect(new Slug('x').equals(new Handle('x'))).toBe(false);
      expect(new Slug('x').equals(new Slug('x'))).toBe(true);
    });

    it('uma subclasse continua na família da base', () => {
      // Arrange
      class ShortTitle extends PostTitle {}

      // Act / Assert
      expect(new ShortTitle('Olá').equals(new PostTitle('Olá'))).toBe(true);
    });

    it('compara datas pelo instante', () => {
      // Arrange
      class OccurredAt extends ValidatedScalar(z.coerce.date().brand<'OccurredAt'>()) {}

      // Act / Assert
      expect(
        new OccurredAt('2024-01-15T10:30:00Z').equals(new OccurredAt('2024-01-15T10:30:00Z')),
      ).toBe(true);
    });
  });

  describe('Validação', () => {
    it('isValid e validationError refletem o schema', () => {
      // Arrange
      const valid = new PostTitle('Olá');
      const invalid = new PostTitle('');

      // Act / Assert
      expect(valid.isValid()).toBe(true);
      expect(valid.validationError()).toBeUndefined();
      expect(invalid.isValid()).toBe(false);
      expect(invalid.validationError()?.issues[0].message).toBe('title não pode ser vazio');
    });

    it('assertValid devolve this ou lança ZodError', () => {
      // Arrange
      const valid = new PostTitle('Olá');

      // Act / Assert
      expect(valid.assertValid()).toBe(valid);
      expect(() => new PostTitle('').assertValid()).toThrow(z.ZodError);
    });

    it('reavalia depois de o valor mudar', () => {
      // Arrange
      const title = new PostTitle('Olá');

      // Act
      (title as any).value = '';

      // Assert
      expect(title.isValid()).toBe(false);
    });

    it('integra com o class-validator', async () => {
      // Arrange
      const invalid = new PostTitle('');

      // Act
      const errors = await validate(invalid);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('value');
      expect(Object.values(errors[0].constraints ?? {})).toContain('title não pode ser vazio');
    });

    it('não acusa erro num value object válido', async () => {
      // Arrange / Act
      const errors = await validate(new PostTitle('Olá'));

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('usa a description do schema na mensagem, como o mixin de objeto', () => {
      // Arrange
      const validator = new ZodScalarValidator();
      const schema = z.string().min(3).describe('Username');

      // Act
      const message = validator.defaultMessage({
        constraints: [schema],
        value: 'ab',
        property: 'value',
        object: {},
        targetName: 'Username',
      });

      // Assert
      expect(message).toBe('Username is invalid');
    });
  });

  describe('Estáticos', () => {
    it('parse devolve a instância da classe concreta', () => {
      // Arrange / Act
      const title = PostTitle.parse('  Olá  ');

      // Assert
      expect(title).toBeInstanceOf(PostTitle);
      expect(title.value).toBe('Olá');
      expect(title.isQuestion()).toBe(false);
    });

    it('parse lança ZodError para valor inválido', () => {
      // Arrange / Act / Assert
      expect(() => PostTitle.parse('')).toThrow(z.ZodError);
    });

    it('safeParse não lança e devolve a instância', () => {
      // Arrange / Act
      const ok = PostTitle.safeParse(' Olá ');
      const fail = PostTitle.safeParse('');

      // Assert
      expect(ok.success).toBe(true);
      expect(ok.data).toBeInstanceOf(PostTitle);
      expect(ok.data?.value).toBe('Olá');
      expect(fail.success).toBe(false);
      expect(fail.error?.issues[0].message).toBe('title não pode ser vazio');
    });

    it('parse não aplica um transform duas vezes', () => {
      // Arrange
      class Exclaimed extends ValidatedScalar(z.string().transform((v) => `${v}!`)) {}

      // Act
      const parsed = Exclaimed.parse('oi');

      // Assert
      expect(parsed.value).toBe('oi!');
    });

    it('is é guarda de tipo da classe concreta', () => {
      // Arrange
      const title = new PostTitle('Olá');

      // Act / Assert
      expect(PostTitle.is(title)).toBe(true);
      expect(PostTitle.is('Olá')).toBe(false);
      expect(Email.is(title)).toBe(false);
    });

    it('accepts responde sem construir nada', () => {
      // Arrange / Act / Assert
      expect(PostTitle.accepts(' Olá ')).toBe(true);
      expect(PostTitle.accepts('')).toBe(false);
      expect(PostTitle.accepts(new PostTitle('Olá'))).toBe(true);
    });

    it('wrap envolve um valor já validado', () => {
      // Arrange / Act
      const title = PostTitle.wrap('Olá' as any);

      // Assert
      expect(title).toBeInstanceOf(PostTitle);
      expect(title.value).toBe('Olá');
      expect(title.isValid()).toBe(true);
    });
  });

  describe('Herança: regras específicas', () => {
    it('métodos novos enxergam o valor tipado', () => {
      // Arrange / Act
      const title = new PostTitle('Isto é uma pergunta?');

      // Assert
      expect(title.isQuestion()).toBe(true);
      expect(new Email('a@b.com').domain).toBe('b.com');
    });

    it('narrow aperta as regras mantendo o tipo da classe de origem', async () => {
      // Arrange
      class ShortTitle extends PostTitle.narrow((title) => title.max(5, 'title curto demais')) {}

      // Act
      const ok = new ShortTitle('Olá');
      const tooLong = new ShortTitle('Um título bem grande');

      // Assert
      expect(ok.isValid()).toBe(true);
      expect(tooLong.isValid()).toBe(false);
      expect(await validate(tooLong)).toHaveLength(1);
      // a base continua aceitando o mesmo valor
      expect(new PostTitle('Um título bem grande').isValid()).toBe(true);
    });

    it('parse da subclasse devolve a subclasse', () => {
      // Arrange
      class ShortTitle extends PostTitle.narrow((title) => title.max(5)) {}

      // Act
      const parsed = ShortTitle.parse('Olá');

      // Assert
      expect(parsed).toBeInstanceOf(ShortTitle);
      expect(parsed).toBeInstanceOf(PostTitle);
      expect(() => ShortTitle.parse('Um título bem grande')).toThrow(z.ZodError);
    });

    it('sobrescrever static schema na mão também vale, remarcando a brand', async () => {
      // Arrange
      class ExclaimedTitle extends PostTitle {
        static override schema = PostTitleSchema.endsWith('!', 'precisa terminar com !').brand<'PostTitle'>();
      }

      // Act
      const ok = new ExclaimedTitle('Olá!');
      const bad = new ExclaimedTitle('Olá');

      // Assert
      expect(ok.isValid()).toBe(true);
      expect(bad.isValid()).toBe(false);
      expect(await validate(bad)).toHaveLength(1);
    });

    it('o nome da classe segue a subclasse', () => {
      // Arrange
      class ShortTitle extends PostTitle {}

      // Act / Assert
      expect(PostTitle.name).toBe('PostTitle');
      expect(ShortTitle.name).toBe('ShortTitle');
      expect(inspect(new ShortTitle('Olá'))).toBe('ShortTitle("Olá")');
    });
  });

  describe('class-transformer', () => {
    it('plainToInstance normaliza pelo schema', () => {
      // Arrange / Act
      const title = plainToInstance(PostTitle, { value: '  Olá  ' });

      // Assert
      expect(title).toBeInstanceOf(PostTitle);
      expect(title.value).toBe('Olá');
    });

    it('instanceToPlain expõe o value', () => {
      // Arrange / Act
      const plain = instanceToPlain(new PostTitle('Olá'));

      // Assert
      expect(plain).toEqual({ value: 'Olá' });
    });

    it('não vaza o cache de validação na serialização', () => {
      // Arrange
      const title = new PostTitle('Olá');

      // Act
      title.isValid();

      // Assert
      expect(Object.keys(instanceToPlain(title))).toEqual(['value']);
      expect(JSON.stringify(title)).toBe('"Olá"');
    });
  });

  describe('Registry de decorators', () => {
    it('aplica decorators de propriedade do schema na subclasse', () => {
      // Arrange
      const metadataKey = Symbol('gql-field');
      const schema = z.string().brand<'Decorated'>();
      schema.register(DECORATOR_REGISTRY, {
        decorators: [
          ((target: object, key: string | symbol) => {
            Reflect.defineMetadata(metadataKey, 'sim', target, key);
          }) as PropertyDecorator,
        ],
      });

      // Act
      @InheritValidatedMetadata()
      class Decorated extends ValidatedScalar(schema) {}

      // Assert
      expect(Reflect.getMetadata(metadataKey, Decorated.prototype, 'value')).toBe('sim');
    });

    /**
     * Um registry isolado **soma** ao global, e não o substitui: um DTO pode misturar campos dos dois,
     * e quem embutiu o value object com um registry próprio não perde os decorators que o schema já
     * carregava. A deduplicação existe para o caso de o mesmo decorator estar nos dois lugares —
     * aplicá-lo duas vezes sobrescreveria metadata em silêncio.
     */
    it('um registry isolado soma ao global, sem aplicar o mesmo decorator duas vezes', () => {
      // Arrange
      const aplicados: string[] = [];
      const marcar =
        (nome: string): PropertyDecorator =>
        (target, key) => {
          aplicados.push(nome);
          if (key !== undefined) {
            Reflect.defineMetadata(`marca:${nome}`, true, target, key);
          }
        };
      const doGlobal = marcar('global');
      // o mesmo decorator nos dois lados: é o caso que a deduplicação existe para atender
      const nosDois = marcar('nos-dois');
      const isolado = createDecoratorRegistry();
      const schema = z.string().brand<'DoisRegistries'>();
      schema.register(DECORATOR_REGISTRY, { decorators: [doGlobal, nosDois] });
      schema.register(isolado, { decorators: [nosDois] });

      // Act
      @InheritValidatedMetadata()
      class DoisRegistries extends ValidatedScalar(schema, { DECORATOR_REGISTRY: isolado }) {}

      // Assert — os dois chegaram na subclasse…
      expect(Reflect.getMetadata('marca:nos-dois', DoisRegistries.prototype, 'value')).toBe(true);
      expect(Reflect.getMetadata('marca:global', DoisRegistries.prototype, 'value')).toBe(true);
      // …e o que estava nos dois registries não foi aplicado mais vezes que o que estava em um só
      expect(aplicados.filter((nome) => nome === 'nos-dois')).toHaveLength(
        aplicados.filter((nome) => nome === 'global').length,
      );
    });

    it('marca o design:type do value conforme o schema', () => {
      // Arrange
      class Score extends ValidatedScalar(z.number().brand<'Score'>()) {}
      class OccurredAt extends ValidatedScalar(z.coerce.date().brand<'OccurredAt'>()) {}

      // Act / Assert
      expect(Reflect.getMetadata('design:type', PostTitle.prototype, 'value')).toBe(String);
      expect(Reflect.getMetadata('design:type', Score.prototype, 'value')).toBe(Number);
      expect(Reflect.getMetadata('design:type', OccurredAt.prototype, 'value')).toBe(Date);
    });
  });

  describe('field(): o schema para embutir', () => {
    it('é estável por classe e fica registrado apontando para ela', () => {
      // Arrange / Act
      const field = PostTitle.field();

      // Assert
      expect(PostTitle.field()).toBe(field);
      expect(getEmbedded(field)).toEqual({ kind: 'scalar', target: PostTitle });
    });

    it('parseia valor cru para instância', () => {
      // Arrange
      const field = PostTitle.field();

      // Act
      const parsed = field.parse('  Olá  ');

      // Assert
      expect(parsed).toBeInstanceOf(PostTitle);
      expect((parsed as PostTitle).value).toBe('Olá');
    });

    it('aceita um value object já pronto', () => {
      // Arrange
      const field = PostTitle.field();

      // Act
      const parsed = field.parse(new PostTitle('Olá'));

      // Assert
      expect(parsed).toBeInstanceOf(PostTitle);
    });

    it('preserva as mensagens de erro do schema', () => {
      // Arrange
      const field = PostTitle.field();

      // Act
      const result = field.safeParse('');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('title não pode ser vazio');
    });

    it('a subclasse tem o seu próprio field', () => {
      // Arrange
      class ShortTitle extends PostTitle.narrow((title) => title.max(5)) {}

      // Act
      const field = ShortTitle.field();

      // Assert
      expect(field).not.toBe(PostTitle.field());
      expect(getEmbedded(field)?.target).toBe(ShortTitle);
      expect(field.parse('Olá')).toBeInstanceOf(ShortTitle);
    });
  });

  describe('Helpers', () => {
    it('isScalarValueObject reconhece qualquer família', () => {
      // Arrange / Act / Assert
      expect(isScalarValueObject(new PostTitle('Olá'))).toBe(true);
      expect(isScalarValueObject(new Email('a@b.com'))).toBe(true);
      expect(isScalarValueObject('Olá')).toBe(false);
      expect(isScalarValueObject(null)).toBe(false);
      expect(isScalarValueObject({ value: 'Olá' })).toBe(false);
    });

    it('rawScalarValue desembrulha só quando precisa', () => {
      // Arrange / Act / Assert
      expect(rawScalarValue(new PostTitle('Olá'))).toBe('Olá');
      expect(rawScalarValue('Olá')).toBe('Olá');
      expect(rawScalarValue(undefined)).toBeUndefined();
    });
  });

  describe('Rejeições', () => {
    it('recusa um schema de objeto e aponta o mixin certo', () => {
      // Arrange / Act / Assert
      expect(() => ValidatedScalar(z.object({ a: z.string() }) as any)).toThrow(
        /ValidatedDto.Embeddable/,
      );
    });
  });
  /**
   * As formas de valor que o projeto ainda não usa, mas que o mixin promete atender.
   *
   * Um value object escalar não é só texto: o mixin aceita número, data, booleano, array e bigint, e
   * cada um traz um detalhe próprio na igualdade, na impressão e no `design:type` que o Nest lê. São
   * caminhos que nenhum `PostId` exercita — e é exatamente por isso que quebram sem ninguém notar,
   * no dia em que aparecer o primeiro value object numérico.
   */
  describe('escalares que não são texto', () => {
    class Pontuacao extends ValidatedScalar(z.number().brand<'Pontuacao'>()) {}
    class Vencimento extends ValidatedScalar(z.date().brand<'Vencimento'>()) {}
    class Ativo extends ValidatedScalar(z.boolean().brand<'Ativo'>()) {}
    class Etiquetas extends ValidatedScalar(z.array(z.string()).brand<'Etiquetas'>()) {}
    class Serie extends ValidatedScalar(z.bigint().brand<'Serie'>()) {}

    it('números comparam por valor, e dois NaN são o mesmo valor', () => {
      // Assert
      expect(new Pontuacao(10).equals(new Pontuacao(10))).toBe(true);
      expect(new Pontuacao(10).equals(new Pontuacao(11))).toBe(false);
      expect(new Pontuacao(Number.NaN).equals(new Pontuacao(Number.NaN))).toBe(true);
    });

    it('arrays comparam item a item, e a ordem conta', () => {
      // Assert
      expect(new Etiquetas(['a', 'b']).equals(new Etiquetas(['a', 'b']))).toBe(true);
      expect(new Etiquetas(['a', 'b']).equals(new Etiquetas(['b', 'a']))).toBe(false);
      expect(new Etiquetas(['a']).equals(new Etiquetas(['a', 'b']))).toBe(false);
    });

    /** Uma data atravessa protocolo como ISO; em contexto numérico, como epoch. */
    it('datas imprimem em ISO e coagem para epoch quando o contexto é numérico', () => {
      // Arrange
      const at = new Date('2026-09-08T12:00:00.000Z');
      const vencimento = new Vencimento(at);

      // Assert
      expect(String(vencimento)).toBe('2026-09-08T12:00:00.000Z');
      expect(`${vencimento}`).toBe('2026-09-08T12:00:00.000Z');
      expect(+vencimento).toBe(at.getTime());
      expect(vencimento.equals(new Vencimento(new Date(at.getTime())))).toBe(true);
    });

    /**
     * `toString()` protege a data inválida; a coerção implícita (`String(vo)`, `` `${vo}` ``) **não** —
     * ela passa pelo `[Symbol.toPrimitive]`, que chama `toISOString()` direto e propaga o `RangeError`.
     * As duas rotas divergem, e o teste registra as duas como elas são hoje.
     */
    it('toString protege a data inválida, mas a coerção implícita propaga o RangeError', () => {
      // Arrange
      const invalida = new Vencimento(new Date('não é data'));

      // Assert
      expect(invalida.toString()).toBe('Invalid Date');
      expect(() => `${invalida}`).toThrow(RangeError);
    });

    /** O `design:type` é o que o `emitDecoratorMetadata` poria se a classe fosse escrita à mão. */
    it('o design:type do campo value acompanha o tipo do schema', () => {
      // Arrange
      const designTypeOf = (target: any) =>
        Reflect.getMetadata('design:type', target.prototype, 'value');

      // Assert
      expect(designTypeOf(Pontuacao)).toBe(Number);
      expect(designTypeOf(Vencimento)).toBe(Date);
      expect(designTypeOf(Ativo)).toBe(Boolean);
      expect(designTypeOf(Etiquetas)).toBe(Array);
      expect(designTypeOf(Serie)).toBe(BigInt);
      expect(designTypeOf(PostTitle)).toBe(String);
    });

    /** Os embrulhos são atravessados: o que importa é o tipo lá no fundo. */
    it('optional, nullable e default não escondem o tipo de baixo', () => {
      // Arrange
      class Talvez extends ValidatedScalar(z.number().optional() as any) {}
      class Nulo extends ValidatedScalar(z.number().nullable() as any) {}
      class ComPadrao extends ValidatedScalar(z.number().default(0) as any) {}

      // Assert
      expect(Reflect.getMetadata('design:type', Talvez.prototype, 'value')).toBe(Number);
      expect(Reflect.getMetadata('design:type', Nulo.prototype, 'value')).toBe(Number);
      expect(Reflect.getMetadata('design:type', ComPadrao.prototype, 'value')).toBe(Number);
    });
  });

  describe('bordas de impressão e de validação', () => {
    class Opcional extends ValidatedScalar(z.string().nullish() as any) {}

    it('um valor ausente imprime como string vazia, não como "null"', () => {
      // Assert
      expect(String(new Opcional(null as any))).toBe('');
      expect(String(new Opcional(undefined as any))).toBe('');
    });

    /**
     * `plainToInstance` normaliza pelo schema — e, quando o valor não passa, mantém o que veio em vez
     * de engolir. Quem recusa é a validação, depois, com a mensagem do domínio.
     */
    it('plainToInstance mantém o valor inválido para a validação recusar depois', async () => {
      // Act
      const invalido = plainToInstance(PostTitle, { value: '   ' });

      // Assert
      expect(invalido.value).toBe('   ');
      expect(await validate(invalido)).toHaveLength(1);
    });

    it('validationError devolve undefined para um valor válido e o erro para um inválido', () => {
      // Assert
      expect(new PostTitle('ok').validationError()).toBeUndefined();
      expect(new PostTitle('   ').validationError()).toBeInstanceOf(z.ZodError);
    });

    /**
     * O `defaultMessage` do validador tem um terceiro caso, além de "tem description" e "falhou":
     * o valor **passa**. Não é uma mensagem que o usuário deva ver, e o texto genérico é o sinal de
     * que ela foi pedida fora de hora.
     */
    it('a mensagem padrão do validador cobre o caso em que não há falha a relatar', () => {
      // Arrange
      const validator = new ZodScalarValidator();
      const args = (value: unknown, schema: z.ZodType) =>
        ({ value, constraints: [schema], object: {}, property: 'value', targetName: 'X' }) as any;

      // Assert
      expect(validator.defaultMessage(args('ok', z.string().min(1)))).toBe('Validation failed');
      expect(validator.defaultMessage(args('', z.string().min(1, 'vazio não vale')))).toBe('vazio não vale');
      expect(validator.defaultMessage(args('', z.string().min(1).describe('Título')))).toBe('Título is invalid');
    });
  });
});
