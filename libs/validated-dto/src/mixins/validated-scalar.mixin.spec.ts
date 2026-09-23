import 'reflect-metadata';

import { inspect } from 'node:util';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
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

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('email inválido'))
  .brand<'Email'>();

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
      const title = new PostTitle('   Nest + GraphQL   ');

      expect(title.value).toBe('Nest + GraphQL');
    });

    it('aplica toda a cadeia de transformação do schema', () => {
      const email = new Email('  Manuel@Example.COM ');

      expect(email.value).toBe('manuel@example.com');
    });

    it('aceita outro value object como entrada (desembrulha)', () => {
      const original = new PostTitle('Olá');

      const copy = new PostTitle(original);

      expect(copy.value).toBe('Olá');
      expect(copy).not.toBe(original);
    });

    it('guarda o valor cru quando ele é inválido, em vez de lançar', () => {
      const title = new PostTitle('   ');

      expect(title.value).toBe('   ');
      expect(title.isValid()).toBe(false);
    });

    it('lança no construtor quando a classe é strict', () => {
      class StrictTitle extends ValidatedScalar(PostTitleSchema, {
        strict: true,
      }) {}

      expect(() => new StrictTitle('')).toThrow(z.ZodError);
      expect(() => new StrictTitle('ok')).not.toThrow();
    });
  });

  describe('O value object é o valor', () => {
    it('toString devolve o texto', () => {
      const title = new PostTitle('Olá');

      expect(title.toString()).toBe('Olá');
      expect(`${title}`).toBe('Olá');
      expect(String(title)).toBe('Olá');
    });

    it('valueOf e toJSON devolvem o valor cru', () => {
      const title = new PostTitle('Olá');

      expect(title.valueOf()).toBe('Olá');
      expect(title.toJSON()).toBe('Olá');
      expect(JSON.stringify({ title })).toBe('{"title":"Olá"}');
    });

    it('participa de comparações e concatenações como o valor cru', () => {
      const title = new PostTitle('Olá');

      expect(title == ('Olá' as any)).toBe(true);
      expect(title + '!').toBe('Olá!');
    });

    it('converte números pelo hint numérico', () => {
      class Score extends ValidatedScalar(z.number().min(0).brand<'Score'>()) {}
      const score = new Score(42);

      expect(Number(score)).toBe(42);
      expect((score as any) + 1).toBe(43);
      expect(score > (41 as any)).toBe(true);
    });

    it('serializa datas como ISO no toString e mantém o Date no valor', () => {
      class OccurredAt extends ValidatedScalar(
        z.coerce.date().brand<'OccurredAt'>(),
      ) {}
      const occurredAt = new OccurredAt('2024-01-15T10:30:00.000Z');

      expect(occurredAt.value).toBeInstanceOf(Date);
      expect(occurredAt.toString()).toBe('2024-01-15T10:30:00.000Z');
      expect(JSON.stringify({ occurredAt })).toBe(
        '{"occurredAt":"2024-01-15T10:30:00.000Z"}',
      );
      expect(Number(occurredAt)).toBe(Date.parse('2024-01-15T10:30:00.000Z'));
    });

    it('imprime legível no console', () => {
      const title = new PostTitle('Olá');

      expect(inspect(title)).toBe('PostTitle("Olá")');
    });
  });

  describe('Igualdade de valor', () => {
    it('duas instâncias com o mesmo valor são iguais', () => {
      expect(new PostTitle('Olá').equals(new PostTitle('Olá'))).toBe(true);
      expect(new PostTitle('Olá').equals(new PostTitle('Tchau'))).toBe(false);
    });

    it('compara com o valor cru', () => {
      expect(new PostTitle('Olá').equals('Olá')).toBe(true);
      expect(new PostTitle('Olá').equals(null)).toBe(false);
      expect(new PostTitle('Olá').equals(undefined)).toBe(false);
    });

    it('value objects de famílias diferentes nunca são iguais', () => {
      class Slug extends ValidatedScalar(z.string().brand<'Slug'>()) {}
      class Handle extends ValidatedScalar(z.string().brand<'Handle'>()) {}

      expect(new Slug('x').equals(new Handle('x'))).toBe(false);
      expect(new Slug('x').equals(new Slug('x'))).toBe(true);
    });

    it('uma subclasse continua na família da base', () => {
      class ShortTitle extends PostTitle {}

      expect(new ShortTitle('Olá').equals(new PostTitle('Olá'))).toBe(true);
    });

    it('compara datas pelo instante', () => {
      class OccurredAt extends ValidatedScalar(
        z.coerce.date().brand<'OccurredAt'>(),
      ) {}

      expect(
        new OccurredAt('2024-01-15T10:30:00Z').equals(
          new OccurredAt('2024-01-15T10:30:00Z'),
        ),
      ).toBe(true);
    });
  });

  describe('Validação', () => {
    it('isValid e validationError refletem o schema', () => {
      const valid = new PostTitle('Olá');
      const invalid = new PostTitle('');

      expect(valid.isValid()).toBe(true);
      expect(valid.validationError()).toBeUndefined();
      expect(invalid.isValid()).toBe(false);
      expect(invalid.validationError()?.issues[0].message).toBe(
        'title não pode ser vazio',
      );
    });

    it('assertValid devolve this ou lança ZodError', () => {
      const valid = new PostTitle('Olá');

      expect(valid.assertValid()).toBe(valid);
      expect(() => new PostTitle('').assertValid()).toThrow(z.ZodError);
    });

    it('reavalia depois de o valor mudar', () => {
      const title = new PostTitle('Olá');

      (title as any).value = '';

      expect(title.isValid()).toBe(false);
    });

    it('integra com o class-validator', async () => {
      const invalid = new PostTitle('');

      const errors = await validate(invalid);

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('value');
      expect(Object.values(errors[0].constraints ?? {})).toContain(
        'title não pode ser vazio',
      );
    });

    it('não acusa erro num value object válido', async () => {
      const errors = await validate(new PostTitle('Olá'));

      expect(errors).toHaveLength(0);
    });

    it('usa a description do schema na mensagem, como o mixin de objeto', () => {
      const validator = new ZodScalarValidator();
      const schema = z.string().min(3).describe('Username');

      const message = validator.defaultMessage({
        constraints: [schema],
        value: 'ab',
        property: 'value',
        object: {},
        targetName: 'Username',
      });

      expect(message).toBe('Username is invalid');
    });
  });

  describe('Estáticos', () => {
    it('parse devolve a instância da classe concreta', () => {
      const title = PostTitle.parse('  Olá  ');

      expect(title).toBeInstanceOf(PostTitle);
      expect(title.value).toBe('Olá');
      expect(title.isQuestion()).toBe(false);
    });

    it('parse lança ZodError para valor inválido', () => {
      expect(() => PostTitle.parse('')).toThrow(z.ZodError);
    });

    it('safeParse não lança e devolve a instância', () => {
      const ok = PostTitle.safeParse(' Olá ');
      const fail = PostTitle.safeParse('');

      expect(ok.success).toBe(true);
      expect(ok.data).toBeInstanceOf(PostTitle);
      expect(ok.data?.value).toBe('Olá');
      expect(fail.success).toBe(false);
      expect(fail.error?.issues[0].message).toBe('title não pode ser vazio');
    });

    it('parse não aplica um transform duas vezes', () => {
      class Exclaimed extends ValidatedScalar(
        z.string().transform((v) => `${v}!`),
      ) {}

      const parsed = Exclaimed.parse('oi');

      expect(parsed.value).toBe('oi!');
    });

    it('is é guarda de tipo da classe concreta', () => {
      const title = new PostTitle('Olá');

      expect(PostTitle.is(title)).toBe(true);
      expect(PostTitle.is('Olá')).toBe(false);
      expect(Email.is(title)).toBe(false);
    });

    it('accepts responde sem construir nada', () => {
      expect(PostTitle.accepts(' Olá ')).toBe(true);
      expect(PostTitle.accepts('')).toBe(false);
      expect(PostTitle.accepts(new PostTitle('Olá'))).toBe(true);
    });

    it('wrap envolve um valor já validado', () => {
      const title = PostTitle.wrap('Olá' as any);

      expect(title).toBeInstanceOf(PostTitle);
      expect(title.value).toBe('Olá');
      expect(title.isValid()).toBe(true);
    });
  });

  describe('Herança: regras específicas', () => {
    it('métodos novos enxergam o valor tipado', () => {
      const title = new PostTitle('Isto é uma pergunta?');

      expect(title.isQuestion()).toBe(true);
      expect(new Email('a@b.com').domain).toBe('b.com');
    });

    it('narrow aperta as regras mantendo o tipo da classe de origem', async () => {
      class ShortTitle extends PostTitle.narrow((title) =>
        title.max(5, 'title curto demais'),
      ) {}

      const ok = new ShortTitle('Olá');
      const tooLong = new ShortTitle('Um título bem grande');

      expect(ok.isValid()).toBe(true);
      expect(tooLong.isValid()).toBe(false);
      expect(await validate(tooLong)).toHaveLength(1);
      expect(new PostTitle('Um título bem grande').isValid()).toBe(true);
    });

    it('parse da subclasse devolve a subclasse', () => {
      class ShortTitle extends PostTitle.narrow((title) => title.max(5)) {}

      const parsed = ShortTitle.parse('Olá');

      expect(parsed).toBeInstanceOf(ShortTitle);
      expect(parsed).toBeInstanceOf(PostTitle);
      expect(() => ShortTitle.parse('Um título bem grande')).toThrow(
        z.ZodError,
      );
    });

    it('sobrescrever static schema na mão também vale, remarcando a brand', async () => {
      class ExclaimedTitle extends PostTitle {
        static override schema = PostTitleSchema.endsWith(
          '!',
          'precisa terminar com !',
        ).brand<'PostTitle'>();
      }

      const ok = new ExclaimedTitle('Olá!');
      const bad = new ExclaimedTitle('Olá');

      expect(ok.isValid()).toBe(true);
      expect(bad.isValid()).toBe(false);
      expect(await validate(bad)).toHaveLength(1);
    });

    it('o nome da classe segue a subclasse', () => {
      class ShortTitle extends PostTitle {}

      expect(PostTitle.name).toBe('PostTitle');
      expect(ShortTitle.name).toBe('ShortTitle');
      expect(inspect(new ShortTitle('Olá'))).toBe('ShortTitle("Olá")');
    });
  });

  describe('class-transformer', () => {
    it('plainToInstance normaliza pelo schema', () => {
      const title = plainToInstance(PostTitle, { value: '  Olá  ' });

      expect(title).toBeInstanceOf(PostTitle);
      expect(title.value).toBe('Olá');
    });

    it('instanceToPlain expõe o value', () => {
      const plain = instanceToPlain(new PostTitle('Olá'));

      expect(plain).toEqual({ value: 'Olá' });
    });

    it('não vaza o cache de validação na serialização', () => {
      const title = new PostTitle('Olá');

      title.isValid();

      expect(Object.keys(instanceToPlain(title))).toEqual(['value']);
      expect(JSON.stringify(title)).toBe('"Olá"');
    });
  });

  describe('Registry de decorators', () => {
    it('aplica decorators de propriedade do schema na subclasse', () => {
      const metadataKey = Symbol('gql-field');
      const schema = z.string().brand<'Decorated'>();
      schema.register(DECORATOR_REGISTRY, {
        decorators: [
          ((target: object, key: string | symbol) => {
            Reflect.defineMetadata(metadataKey, 'sim', target, key);
          }) as PropertyDecorator,
        ],
      });

      @InheritValidatedMetadata()
      class Decorated extends ValidatedScalar(schema) {}

      expect(
        Reflect.getMetadata(metadataKey, Decorated.prototype, 'value'),
      ).toBe('sim');
    });

    it('um registry isolado soma ao global, sem aplicar o mesmo decorator duas vezes', () => {
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
      const nosDois = marcar('nos-dois');
      const isolado = createDecoratorRegistry();
      const schema = z.string().brand<'DoisRegistries'>();
      schema.register(DECORATOR_REGISTRY, { decorators: [doGlobal, nosDois] });
      schema.register(isolado, { decorators: [nosDois] });

      @InheritValidatedMetadata()
      class DoisRegistries extends ValidatedScalar(schema, {
        DECORATOR_REGISTRY: isolado,
      }) {}

      expect(
        Reflect.getMetadata(
          'marca:nos-dois',
          DoisRegistries.prototype,
          'value',
        ),
      ).toBe(true);
      expect(
        Reflect.getMetadata('marca:global', DoisRegistries.prototype, 'value'),
      ).toBe(true);
      expect(aplicados.filter((nome) => nome === 'nos-dois')).toHaveLength(
        aplicados.filter((nome) => nome === 'global').length,
      );
    });

    it('marca o design:type do value conforme o schema', () => {
      class Score extends ValidatedScalar(z.number().brand<'Score'>()) {}
      class OccurredAt extends ValidatedScalar(
        z.coerce.date().brand<'OccurredAt'>(),
      ) {}

      expect(
        Reflect.getMetadata('design:type', PostTitle.prototype, 'value'),
      ).toBe(String);
      expect(Reflect.getMetadata('design:type', Score.prototype, 'value')).toBe(
        Number,
      );
      expect(
        Reflect.getMetadata('design:type', OccurredAt.prototype, 'value'),
      ).toBe(Date);
    });
  });

  describe('field(): o schema para embutir', () => {
    it('é estável por classe e fica registrado apontando para ela', () => {
      const field = PostTitle.field();

      expect(PostTitle.field()).toBe(field);
      expect(getEmbedded(field)).toEqual({ kind: 'scalar', target: PostTitle });
    });

    it('parseia valor cru para instância', () => {
      const field = PostTitle.field();

      const parsed = field.parse('  Olá  ');

      expect(parsed).toBeInstanceOf(PostTitle);
      expect((parsed as PostTitle).value).toBe('Olá');
    });

    it('aceita um value object já pronto', () => {
      const field = PostTitle.field();

      const parsed = field.parse(new PostTitle('Olá'));

      expect(parsed).toBeInstanceOf(PostTitle);
    });

    it('preserva as mensagens de erro do schema', () => {
      const field = PostTitle.field();

      const result = field.safeParse('');

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('title não pode ser vazio');
    });

    it('a subclasse tem o seu próprio field', () => {
      class ShortTitle extends PostTitle.narrow((title) => title.max(5)) {}

      const field = ShortTitle.field();

      expect(field).not.toBe(PostTitle.field());
      expect(getEmbedded(field)?.target).toBe(ShortTitle);
      expect(field.parse('Olá')).toBeInstanceOf(ShortTitle);
    });
  });

  describe('Helpers', () => {
    it('isScalarValueObject reconhece qualquer família', () => {
      expect(isScalarValueObject(new PostTitle('Olá'))).toBe(true);
      expect(isScalarValueObject(new Email('a@b.com'))).toBe(true);
      expect(isScalarValueObject('Olá')).toBe(false);
      expect(isScalarValueObject(null)).toBe(false);
      expect(isScalarValueObject({ value: 'Olá' })).toBe(false);
    });

    it('rawScalarValue desembrulha só quando precisa', () => {
      expect(rawScalarValue(new PostTitle('Olá'))).toBe('Olá');
      expect(rawScalarValue('Olá')).toBe('Olá');
      expect(rawScalarValue(undefined)).toBeUndefined();
    });
  });

  describe('Rejeições', () => {
    it('recusa um schema de objeto e aponta o mixin certo', () => {
      expect(() => ValidatedScalar(z.object({ a: z.string() }) as any)).toThrow(
        /ValidatedDto.Embeddable/,
      );
    });
  });
  describe('escalares que não são texto', () => {
    class Pontuacao extends ValidatedScalar(z.number().brand<'Pontuacao'>()) {}
    class Vencimento extends ValidatedScalar(z.date().brand<'Vencimento'>()) {}
    class Ativo extends ValidatedScalar(z.boolean().brand<'Ativo'>()) {}
    class Etiquetas extends ValidatedScalar(
      z.array(z.string()).brand<'Etiquetas'>(),
    ) {}
    class Serie extends ValidatedScalar(z.bigint().brand<'Serie'>()) {}

    it('números comparam por valor, e dois NaN são o mesmo valor', () => {
      expect(new Pontuacao(10).equals(new Pontuacao(10))).toBe(true);
      expect(new Pontuacao(10).equals(new Pontuacao(11))).toBe(false);
      expect(new Pontuacao(Number.NaN).equals(new Pontuacao(Number.NaN))).toBe(
        true,
      );
    });

    it('arrays comparam item a item, e a ordem conta', () => {
      expect(new Etiquetas(['a', 'b']).equals(new Etiquetas(['a', 'b']))).toBe(
        true,
      );
      expect(new Etiquetas(['a', 'b']).equals(new Etiquetas(['b', 'a']))).toBe(
        false,
      );
      expect(new Etiquetas(['a']).equals(new Etiquetas(['a', 'b']))).toBe(
        false,
      );
    });

    it('datas imprimem em ISO e coagem para epoch quando o contexto é numérico', () => {
      const at = new Date('2026-09-08T12:00:00.000Z');
      const vencimento = new Vencimento(at);

      expect(String(vencimento)).toBe('2026-09-08T12:00:00.000Z');
      expect(`${vencimento}`).toBe('2026-09-08T12:00:00.000Z');
      expect(+vencimento).toBe(at.getTime());
      expect(vencimento.equals(new Vencimento(new Date(at.getTime())))).toBe(
        true,
      );
    });

    it('toString protege a data inválida, mas a coerção implícita propaga o RangeError', () => {
      const invalida = new Vencimento(new Date('não é data'));

      expect(invalida.toString()).toBe('Invalid Date');
      expect(() => `${invalida}`).toThrow(RangeError);
    });

    it('o design:type do campo value acompanha o tipo do schema', () => {
      const designTypeOf = (target: any) =>
        Reflect.getMetadata('design:type', target.prototype, 'value');

      expect(designTypeOf(Pontuacao)).toBe(Number);
      expect(designTypeOf(Vencimento)).toBe(Date);
      expect(designTypeOf(Ativo)).toBe(Boolean);
      expect(designTypeOf(Etiquetas)).toBe(Array);
      expect(designTypeOf(Serie)).toBe(BigInt);
      expect(designTypeOf(PostTitle)).toBe(String);
    });

    it('optional, nullable e default não escondem o tipo de baixo', () => {
      class Talvez extends ValidatedScalar(z.number().optional() as any) {}
      class Nulo extends ValidatedScalar(z.number().nullable() as any) {}
      class ComPadrao extends ValidatedScalar(z.number().default(0) as any) {}

      expect(
        Reflect.getMetadata('design:type', Talvez.prototype, 'value'),
      ).toBe(Number);
      expect(Reflect.getMetadata('design:type', Nulo.prototype, 'value')).toBe(
        Number,
      );
      expect(
        Reflect.getMetadata('design:type', ComPadrao.prototype, 'value'),
      ).toBe(Number);
    });
  });

  describe('bordas de impressão e de validação', () => {
    class Opcional extends ValidatedScalar(z.string().nullish() as any) {}

    it('um valor ausente imprime como string vazia, não como "null"', () => {
      expect(String(new Opcional(null as any))).toBe('');
      expect(String(new Opcional(undefined as any))).toBe('');
    });

    it('plainToInstance mantém o valor inválido para a validação recusar depois', async () => {
      const invalido = plainToInstance(PostTitle, { value: '   ' });

      expect(invalido.value).toBe('   ');
      expect(await validate(invalido)).toHaveLength(1);
    });

    it('validationError devolve undefined para um valor válido e o erro para um inválido', () => {
      expect(new PostTitle('ok').validationError()).toBeUndefined();
      expect(new PostTitle('   ').validationError()).toBeInstanceOf(z.ZodError);
    });

    it('a mensagem padrão do validador cobre o caso em que não há falha a relatar', () => {
      const validator = new ZodScalarValidator();
      const args = (value: unknown, schema: z.ZodType) =>
        ({
          value,
          constraints: [schema],
          object: {},
          property: 'value',
          targetName: 'X',
        }) as any;

      expect(validator.defaultMessage(args('ok', z.string().min(1)))).toBe(
        'Validation failed',
      );
      expect(
        validator.defaultMessage(args('', z.string().min(1, 'vazio não vale'))),
      ).toBe('vazio não vale');
      expect(
        validator.defaultMessage(
          args('', z.string().min(1).describe('Título')),
        ),
      ).toBe('Título is invalid');
    });
  });
});
