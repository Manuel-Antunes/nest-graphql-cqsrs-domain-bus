import "reflect-metadata";

import { instanceToPlain, plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { DECORATOR_REGISTRY } from "../schemas/registries/decorators.registry";
import {
  Embeddable,
  InheritValidatedMetadata,
  ValidatedDto,
} from "./validated-dto.mixin";
import { ValidatedScalar } from "./validated-scalar.mixin";

const PostIdSchema = z.uuid().brand<"PostId">();
const PostTitleSchema = z
  .string()
  .trim()
  .min(1, "title não pode ser vazio")
  .brand<"PostTitle">();
const TagNameSchema = z
  .string()
  .trim()
  .min(1, "tag inválida")
  .brand<"TagName">();

class PostId extends ValidatedDto.Scalar(PostIdSchema, { name: "PostId" }) {}
class PostTitle extends ValidatedDto.Scalar(PostTitleSchema, {
  name: "PostTitle",
}) {}
class TagName extends ValidatedScalar(TagNameSchema, { name: "TagName" }) {}

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

describe("ValidatedDto — value objects embutidos", () => {
  describe("Escalar embutido", () => {
    const PostSchema = z.object({
      id: PostId.field(),
      title: PostTitle.field(),
    });
    const PostDto = ValidatedDto(PostSchema);

    it("o construtor monta a classe a partir do valor cru", () => {
      // Arrange / Act
      const post = new PostDto({ id: ID, title: "  Olá  " });

      // Assert
      expect(post.id).toBeInstanceOf(PostId);
      expect(post.title).toBeInstanceOf(PostTitle);
      expect(post.id.value).toBe(ID);
      expect(post.title.value).toBe("Olá");
    });

    it("aceita um value object já pronto e não o reembrulha", () => {
      // Arrange
      const id = new PostId(ID);

      // Act
      const post = new PostDto({ id, title: "Olá" });

      // Assert
      expect(post.id).toBe(id);
    });

    it("serializa colapsando para o valor cru", () => {
      // Arrange
      const post = new PostDto({ id: ID, title: "Olá" });

      // Act
      const plain = instanceToPlain(post);

      // Assert
      expect(plain).toEqual({ id: ID, title: "Olá" });
    });

    it("JSON.stringify vê o primitivo", () => {
      // Arrange
      const post = new PostDto({ id: ID, title: "Olá" });

      // Act / Assert
      expect(JSON.stringify(post)).toBe(`{"id":"${ID}","title":"Olá"}`);
    });

    it("plainToInstance materializa os value objects", () => {
      // Arrange / Act
      const post = plainToInstance(PostDto, { id: ID, title: "  Olá  " });

      // Assert
      expect(post.id).toBeInstanceOf(PostId);
      expect(post.title.value).toBe("Olá");
    });

    it("fecha o round-trip sem perder nada", () => {
      // Arrange
      const original = { id: ID, title: "Olá" };

      // Act
      const instance = plainToInstance(PostDto, original);
      const plain = instanceToPlain(instance);
      const again = plainToInstance(PostDto, plain);

      // Assert
      expect(plain).toEqual(original);
      expect(again.id).toBeInstanceOf(PostId);
      expect(again.id.equals(instance.id)).toBe(true);
    });

    it("respeita excludeExtraneousValues", () => {
      // Arrange
      const post = new PostDto({ id: ID, title: "Olá" });

      // Act
      const plain = instanceToPlain(post, { excludeExtraneousValues: true });

      // Assert
      expect(plain).toEqual({ id: ID, title: "Olá" });
    });

    it("valida pelo schema do value object", async () => {
      // Arrange
      const invalid = new PostDto({ id: "não-é-uuid", title: "" });

      // Act
      const errors = await validate(invalid);

      // Assert
      expect(errors.map(error => error.property).sort()).toEqual([
        "id",
        "title",
      ]);
      expect(
        Object.values(
          errors.find(e => e.property === "title")!.constraints ?? {},
        ),
      ).toContain("title não pode ser vazio");
    });

    it("não acusa erro num DTO válido", async () => {
      // Arrange / Act
      const errors = await validate(new PostDto({ id: ID, title: "Olá" }));

      // Assert
      expect(errors).toHaveLength(0);
    });

    it("marca o design:type com a classe do value object", () => {
      // Arrange / Act / Assert
      expect(Reflect.getMetadata("design:type", PostDto.prototype, "id")).toBe(
        PostId,
      );
      expect(
        Reflect.getMetadata("design:type", PostDto.prototype, "title"),
      ).toBe(PostTitle);
    });

    it("o value object embutido continua se comportando como o valor", () => {
      // Arrange
      const post = new PostDto({ id: ID, title: "Olá" });

      // Act / Assert
      expect(`${post.title}`).toBe("Olá");
      expect(post.id.equals(ID)).toBe(true);
      expect(post.id.equals(new PostId(OTHER_ID))).toBe(false);
    });
  });

  describe("Opcionais, nulos e defaults", () => {
    it("deixa o opcional ausente em paz", async () => {
      // Arrange
      const Dto = ValidatedDto(
        z.object({ id: PostId.field(), title: PostTitle.field().optional() }),
      );

      // Act
      const instance = new Dto({ id: ID });

      // Assert
      expect(instance.title).toBeUndefined();
      expect(await validate(instance)).toHaveLength(0);
      expect(instanceToPlain(instance)).toEqual({ id: ID });
    });

    it("mantém o null de um campo nullable", async () => {
      // Arrange
      const Dto = ValidatedDto(
        z.object({ id: PostId.field(), title: PostTitle.field().nullable() }),
      );

      // Act
      const instance = new Dto({ id: ID, title: null });

      // Assert
      expect(instance.title).toBeNull();
      expect(await validate(instance)).toHaveLength(0);
      expect(instanceToPlain(instance)).toEqual({ id: ID, title: null });
    });

    it("materializa também o valor que veio do default", () => {
      // Arrange
      const Dto = ValidatedDto(
        z.object({
          tag: TagName.field().default(new TagName("Untagged") as any),
        }),
      );

      // Act
      const fromConstructor = new Dto({});
      const fromTransform = plainToInstance(
        Dto,
        {},
        { exposeDefaultValues: true },
      );

      // Assert
      expect(fromConstructor.tag).toBeInstanceOf(TagName);
      expect(fromConstructor.tag.value).toBe("Untagged");
      expect(fromTransform.tag).toBeInstanceOf(TagName);
    });
  });

  describe("Listas de value objects", () => {
    const Dto = ValidatedDto(
      z.object({ id: PostId.field(), tags: z.array(TagName.field()) }),
    );

    it("monta cada item da lista", () => {
      // Arrange / Act
      const instance = new Dto({ id: ID, tags: ["  nest ", "graphql"] });

      // Assert
      expect(instance.tags).toHaveLength(2);
      expect(instance.tags[0]).toBeInstanceOf(TagName);
      expect(instance.tags[0].value).toBe("nest");
    });

    it("serializa a lista colapsada", () => {
      // Arrange
      const instance = new Dto({ id: ID, tags: ["nest", "graphql"] });

      // Act / Assert
      expect(instanceToPlain(instance)).toEqual({
        id: ID,
        tags: ["nest", "graphql"],
      });
    });

    it("valida item a item", async () => {
      // Arrange
      const instance = new Dto({ id: ID, tags: ["nest", ""] });

      // Act
      const errors = await validate(instance);

      // Assert
      expect(errors.map(error => error.property)).toEqual(["tags"]);
    });

    it("marca o design:type como Array", () => {
      // Arrange / Act / Assert
      expect(Reflect.getMetadata("design:type", Dto.prototype, "tags")).toBe(
        Array,
      );
    });
  });

  describe("Embeddable: value object de vários campos", () => {
    const MoneySchema = z.object({
      amount: z.number().nonnegative("amount não pode ser negativo"),
      currency: z.enum(["BRL", "USD"]).default("BRL"),
    });

    class Money extends Embeddable(MoneySchema) {
      plus(other: Money): Money {
        return this.with({ amount: this.amount + other.amount });
      }
    }

    it("aplica os defaults do schema", () => {
      // Arrange / Act
      const money = new Money({ amount: 10 });

      // Assert
      expect(money.amount).toBe(10);
      expect(money.currency).toBe("BRL");
    });

    it("compara por valor, e não por referência", () => {
      // Arrange / Act / Assert
      expect(new Money({ amount: 10 }).equals(new Money({ amount: 10 }))).toBe(
        true,
      );
      expect(new Money({ amount: 10 }).equals(new Money({ amount: 11 }))).toBe(
        false,
      );
      expect(new Money({ amount: 10 }).equals(null)).toBe(false);
    });

    it("with devolve uma cópia, sem mutar a original", () => {
      // Arrange
      const original = new Money({ amount: 10 });

      // Act
      const changed = original.with({ amount: 25 });

      // Assert
      expect(changed).toBeInstanceOf(Money);
      expect(changed.amount).toBe(25);
      expect(changed.currency).toBe("BRL");
      expect(original.amount).toBe(10);
    });

    it("os métodos da classe continuam disponíveis", () => {
      // Arrange / Act
      const total = new Money({ amount: 10 }).plus(new Money({ amount: 5 }));

      // Assert
      expect(total.amount).toBe(15);
    });

    it("parse e safeParse devolvem a classe", () => {
      // Arrange / Act
      const parsed = Money.parse({ amount: 10 });
      const failed = Money.safeParse({ amount: -1 });

      // Assert
      expect(parsed).toBeInstanceOf(Money);
      expect(failed.success).toBe(false);
      expect(failed.error?.issues[0].message).toBe(
        "amount não pode ser negativo",
      );
      expect(() => Money.parse({ amount: -1 })).toThrow(z.ZodError);
    });

    it("isValid e assertValid olham o estado atual", () => {
      // Arrange
      const money = new Money({ amount: 10 });

      // Act / Assert
      expect(money.isValid()).toBe(true);
      expect(money.assertValid()).toBe(money);
      expect(new Money({ amount: -1 }).isValid()).toBe(false);
      expect(() => new Money({ amount: -1 }).assertValid()).toThrow(z.ZodError);
    });

    it("validationError devolve o erro do estado atual, ou nada", () => {
      // Arrange / Act / Assert
      expect(new Money({ amount: 10 }).validationError()).toBeUndefined();
      expect(new Money({ amount: -1 }).validationError()).toBeInstanceOf(
        z.ZodError,
      );
    });

    it("is reconhece as instâncias da própria classe", () => {
      // Assert
      expect(Money.is(new Money({ amount: 1 }))).toBe(true);
      expect(Money.is({ amount: 1, currency: "BRL" })).toBe(false);
      expect(Money.is(null)).toBe(false);
    });

    /**
     * `field()` sem decorators é **estável por classe**: o mesmo schema volta sempre, e é isso que
     * faz dois DTOs que embutem o mesmo value object compartilharem o vínculo do registry. Com
     * decorators, não dá para cachear — dois DTOs que embutem o mesmo value object com decorators
     * diferentes não podem dividir o campo.
     */
    it("field sem decorators é cacheado por classe; com decorators, não", () => {
      // Act
      const primeiro = Money.field();
      const segundo = Money.field();
      const comDecorator = Money.field({ decorators: [() => undefined] });

      // Assert
      expect(segundo).toBe(primeiro);
      expect(comDecorator).not.toBe(primeiro);
    });

    /**
     * O campo gerado por `field()` é um schema Zod de verdade: parsear por ele **materializa a
     * classe**. É o que faz um DTO montado por `parse` (e não pelo construtor) já vir com o
     * embeddable instanciado, e não com um objeto cru de mesmo shape.
     */
    it("parsear pelo schema do campo materializa a classe, e não um objeto cru", () => {
      // Arrange
      const Pedido = z.object({ total: Money.field() });

      // Act
      const parsed = Pedido.parse({ total: { amount: 10 } });

      // Assert
      expect(parsed.total).toBeInstanceOf(Money);
      expect((parsed.total as Money).currency).toBe("BRL");
      expect((parsed.total as Money).plus(new Money({ amount: 5 })).amount).toBe(15);
    });

    /** `ValidatedDto.embed(VO)` é o mesmo `VO.field()`, com um nome que diz o que está acontecendo. */
    it("embed é o field da classe, com outro nome", () => {
      // Assert
      expect(ValidatedDto.embed(Money)).toBe(Money.field());
      expect(ValidatedDto.embed(PostId)).toBe(PostId.field());
    });

    /**
     * A igualdade compara **valor**, mas não confunde famílias: um `Weight` com os mesmos campos de
     * um `Money` não é um `Money`. Um objeto cru com o mesmo shape, sim — ele não afirma ser de
     * família nenhuma.
     */
    describe("a igualdade e as famílias de value object", () => {
      class Weight extends Embeddable(
        z.object({
          amount: z.number(),
          currency: z.enum(["BRL", "USD"]).default("BRL"),
        }),
      ) {}

      it("um embeddable de outra família nunca é igual, mesmo com o shape idêntico", () => {
        // Assert
        expect(new Money({ amount: 10 }).equals(new Weight({ amount: 10 }))).toBe(false);
      });

      it("um objeto cru com os mesmos campos é igual: é o valor que se compara", () => {
        // Assert
        expect(new Money({ amount: 10 }).equals({ amount: 10, currency: "BRL" })).toBe(true);
      });

      it("comparar com o que não é objeto é falso, e não um erro", () => {
        // Assert
        expect(new Money({ amount: 10 }).equals(undefined)).toBe(false);
        expect(new Money({ amount: 10 }).equals("10")).toBe(false);
      });
    });

    /**
     * A igualdade desce pelos campos, e cada forma tem a sua regra: datas comparam por instante,
     * listas item a item, objetos aninhados chave a chave. Nenhum `===` daria a resposta certa aqui.
     */
    describe("a igualdade campo a campo", () => {
      class Registro extends Embeddable(
        z.object({
          em: z.date(),
          etiquetas: z.array(z.string()).default([]),
          meta: z.object({ a: z.number(), b: z.string() }).optional(),
          nota: z.string().nullable().default(null),
        }),
      ) {}

      const base = () =>
        new Registro({
          em: new Date("2026-09-08T12:00:00.000Z"),
          etiquetas: ["x", "y"],
          meta: { a: 1, b: "dois" },
        });

      it("datas comparam por instante, e não por identidade do objeto", () => {
        // Assert
        expect(base().equals(base())).toBe(true);
        expect(
          base().equals(base().with({ em: new Date("2026-09-08T12:00:01.000Z") })),
        ).toBe(false);
      });

      it("listas comparam item a item, e o tamanho conta", () => {
        // Assert
        expect(base().equals(base().with({ etiquetas: ["x", "y"] }))).toBe(true);
        expect(base().equals(base().with({ etiquetas: ["y", "x"] }))).toBe(false);
        expect(base().equals(base().with({ etiquetas: ["x"] }))).toBe(false);
      });

      it("objetos aninhados comparam chave a chave", () => {
        // Assert
        expect(base().equals(base().with({ meta: { a: 1, b: "dois" } }))).toBe(true);
        expect(base().equals(base().with({ meta: { a: 2, b: "dois" } }))).toBe(false);
        expect(base().equals(base().with({ meta: undefined }))).toBe(false);
      });

      it("null e ausente não são a mesma coisa", () => {
        // Assert
        expect(base().equals(base().with({ nota: null }))).toBe(true);
        expect(base().equals(base().with({ nota: "algo" }))).toBe(false);
      });
    });

    describe("embutido em outro DTO", () => {
      const OrderDto = ValidatedDto(
        z.object({ id: PostId.field(), total: Money.field() }),
      );

      it("materializa a classe concreta, com os métodos dela", () => {
        // Arrange / Act
        const order = new OrderDto({ id: ID, total: { amount: 10 } });

        // Assert
        expect(order.total).toBeInstanceOf(Money);
        expect(order.total.currency).toBe("BRL");
        expect(order.total.plus(new Money({ amount: 5 })).amount).toBe(15);
      });

      it("serializa como objeto aninhado, e não colapsado", () => {
        // Arrange
        const order = new OrderDto({ id: ID, total: { amount: 10 } });

        // Act / Assert
        expect(instanceToPlain(order)).toEqual({
          id: ID,
          total: { amount: 10, currency: "BRL" },
        });
      });

      it("fecha o round-trip pelo class-transformer", () => {
        // Arrange
        const plain = { id: ID, total: { amount: 10, currency: "USD" } };

        // Act
        const order = plainToInstance(OrderDto, plain);

        // Assert
        expect(order.total).toBeInstanceOf(Money);
        expect(order.total.currency).toBe("USD");
        expect(instanceToPlain(order)).toEqual(plain);
      });

      it("valida o embeddable pelo schema dele", async () => {
        // Arrange
        const order = new OrderDto({ id: ID, total: { amount: -1 } });

        // Act
        const errors = await validate(order);

        // Assert
        expect(errors.map(error => error.property)).toEqual(["total"]);
      });

      it("marca o design:type com a classe do embeddable", () => {
        // Arrange / Act / Assert
        expect(
          Reflect.getMetadata("design:type", OrderDto.prototype, "total"),
        ).toBe(Money);
      });
    });

    it("embute escalares dentro de si", () => {
      // Arrange
      class Authorship extends Embeddable(
        z.object({ authorId: PostId.field(), name: TagName.field() }),
      ) {}

      // Act
      const authorship = new Authorship({ authorId: ID, name: "manuel" });

      // Assert
      expect(authorship.authorId).toBeInstanceOf(PostId);
      expect(instanceToPlain(authorship)).toEqual({
        authorId: ID,
        name: "manuel",
      });
      expect(
        authorship.equals(new Authorship({ authorId: ID, name: "manuel" })),
      ).toBe(true);
    });
  });

  describe("Herança do DTO", () => {
    it("a subclasse recebe os decorators de campo do registry", () => {
      // Arrange
      const metadataKey = Symbol("field");
      const idField = PostId.field();
      idField.register(DECORATOR_REGISTRY, {
        decorators: [
          ((target: object, key: string | symbol) => {
            Reflect.defineMetadata(metadataKey, "id", target, key);
          }) as PropertyDecorator,
        ],
      });

      // Act
      @InheritValidatedMetadata()
      class Dto extends ValidatedDto(z.object({ id: idField })) {}

      // Assert
      expect(Reflect.getMetadata(metadataKey, Dto.prototype, "id")).toBe("id");
      expect(Reflect.getMetadata("design:type", Dto.prototype, "id")).toBe(
        PostId,
      );
    });

    it("a subclasse continua materializando os value objects", () => {
      // Arrange
      @InheritValidatedMetadata()
      class Dto extends ValidatedDto(z.object({ id: PostId.field() })) {
        get short(): string {
          return this.id.value.slice(0, 8);
        }
      }

      // Act
      const instance = new Dto({ id: ID });

      // Assert
      expect(instance.id).toBeInstanceOf(PostId);
      expect(instance.short).toBe("11111111");
    });
  });
});
