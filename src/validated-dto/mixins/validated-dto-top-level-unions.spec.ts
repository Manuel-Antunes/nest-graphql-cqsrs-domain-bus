import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { InheritValidatedMetadata, ValidatedDto } from './validated-dto.mixin';

describe('ValidatedDto - Top-Level Union Support', () => {
  describe('Top-Level Discriminated Union', () => {
    it('should create factory for top-level discriminated union', () => {
      const PaymentMethodSchema = z.discriminatedUnion('type', [
        z.object({
          type: z.literal('card'),
          cardNumber: z.string(),
          cvv: z.string(),
        }),
        z.object({
          type: z.literal('paypal'),
          email: z.string().email(),
        }),
        z.object({
          type: z.literal('crypto'),
          walletAddress: z.string(),
        }),
      ]);

      const PaymentMethod = ValidatedDto(PaymentMethodSchema);

      // Test card payment
      const cardPayment = new PaymentMethod({
        type: 'card',
        cardNumber: '1234-5678-9012-3456',
        cvv: '123',
      });

      expect(cardPayment).toBeDefined();
      expect((cardPayment as any).type).toBe('card');
      expect((cardPayment as any).cardNumber).toBe('1234-5678-9012-3456');
    });

    it('should validate top-level discriminated union correctly', async () => {
      const PaymentMethodSchema = z.discriminatedUnion('type', [
        z.object({
          type: z.literal('card'),
          cardNumber: z.string().min(10),
        }),
        z.object({
          type: z.literal('paypal'),
          email: z.string().email(),
        }),
      ]);

      const PaymentMethod = ValidatedDto(PaymentMethodSchema);

      // Valid card payment
      const validPayment = new PaymentMethod({
        type: 'card',
        cardNumber: '1234567890',
      });
      const validErrors = await validate(validPayment);
      expect(validErrors).toHaveLength(0);

      // Invalid card payment (too short)
      const invalidPayment = new PaymentMethod({
        type: 'card',
        cardNumber: '123',
      });
      const invalidErrors = await validate(invalidPayment);
      expect(invalidErrors.length).toBeGreaterThan(0);
    });

    it('should route to correct class based on discriminator', () => {
      const EventSchema = z.discriminatedUnion('eventType', [
        z.object({
          eventType: z.literal('click'),
          x: z.number(),
          y: z.number(),
        }),
        z.object({
          eventType: z.literal('scroll'),
          scrollTop: z.number(),
        }),
      ]);

      const Event = ValidatedDto(EventSchema);

      const clickEvent = new Event({
        eventType: 'click',
        x: 100,
        y: 200,
      });

      const scrollEvent = new Event({
        eventType: 'scroll',
        scrollTop: 500,
      });

      expect((clickEvent as any).eventType).toBe('click');
      expect((clickEvent as any).x).toBe(100);

      expect((scrollEvent as any).eventType).toBe('scroll');
      expect((scrollEvent as any).scrollTop).toBe(500);
    });

    it('should work with class-transformer for discriminated unions', () => {
      const MessageSchema = z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('text'),
          content: z.string(),
        }),
        z.object({
          kind: z.literal('image'),
          url: z.string().url(),
          alt: z.string(),
        }),
      ]);

      const Message = ValidatedDto(MessageSchema);

      const plain = {
        kind: 'text',
        content: 'Hello, world!',
      };

      const instance = plainToInstance(Message, plain);
      expect((instance as any).kind).toBe('text');
      expect((instance as any).content).toBe('Hello, world!');
    });
  });

  describe('Top-Level Standard Union', () => {
    it('should create factory for top-level standard union', () => {
      const ValueSchema = z.union([z.string(), z.number(), z.boolean()]);

      const Value = ValidatedDto(ValueSchema);

      // Test with string
      const stringValue = new Value('hello');
      expect(stringValue).toBeDefined();

      // Test with number
      const numberValue = new Value(42);
      expect(numberValue).toBeDefined();

      // Test with boolean
      const boolValue = new Value(true);
      expect(boolValue).toBeDefined();
    });

    it('should validate top-level standard union correctly', async () => {
      const ValueSchema = z.union([z.string().min(5), z.number().positive()]);

      const Value = ValidatedDto(ValueSchema);

      // Valid string
      const validString = new Value('hello world');
      const stringErrors = await validate(validString);
      expect(stringErrors).toHaveLength(0);

      // Valid number
      const validNumber = new Value(42);
      const numberErrors = await validate(validNumber);
      expect(numberErrors).toHaveLength(0);

      // Invalid (too short string, but doesn't match number either)
      const invalidValue = new Value('hi');
      const invalidErrors = await validate(invalidValue);
      expect(invalidErrors.length).toBeGreaterThan(0);
    });

    it('should handle union of object types', () => {
      const ConfigSchema = z.union([
        z.object({
          mode: z.literal('simple'),
          value: z.string(),
        }),
        z.object({
          mode: z.literal('advanced'),
          settings: z.object({
            debug: z.boolean(),
            verbose: z.boolean(),
          }),
        }),
      ]);

      const Config = ValidatedDto(ConfigSchema);

      const simpleConfig = new Config({
        mode: 'simple',
        value: 'test',
      });

      const advancedConfig = new Config({
        mode: 'advanced',
        settings: {
          debug: true,
          verbose: false,
        },
      });

      expect((simpleConfig as any).mode).toBe('simple');
      expect((advancedConfig as any).mode).toBe('advanced');
    });
  });

  describe('Backward Compatibility - ZodObject Still Works', () => {
    it('should still work with regular ZodObject schemas', async () => {
      const UserSchema = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().positive(),
      });

      const User = ValidatedDto(UserSchema);

      const user = new User({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      });

      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.age).toBe(30);

      const errors = await validate(user);
      expect(errors).toHaveLength(0);
    });

    it('should handle nested objects in regular schemas', () => {
      const ProfileSchema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        settings: z.object({
          theme: z.enum(['light', 'dark']),
          notifications: z.boolean(),
        }),
      });

      const Profile = ValidatedDto(ProfileSchema);

      const profile = new Profile({
        user: {
          name: 'Jane',
          email: 'jane@example.com',
        },
        settings: {
          theme: 'dark',
          notifications: true,
        },
      });

      expect(profile.user.name).toBe('Jane');
      expect(profile.settings.theme).toBe('dark');
    });
  });

  describe('Nested Union DTOs', () => {
    it('should handle discriminated union as nested property', async () => {
      const PaymentMethodSchema = z.discriminatedUnion('type', [
        z.object({
          type: z.literal('card'),
          cardNumber: z.string().min(10),
        }),
        z.object({
          type: z.literal('paypal'),
          email: z.string().email(),
        }),
      ]);

      const OrderSchema = z.object({
        orderId: z.string(),
        paymentMethod: PaymentMethodSchema,
        amount: z.number(),
      });

      const Order = ValidatedDto(OrderSchema);

      const order = new Order({
        orderId: 'ORD-123',
        paymentMethod: {
          type: 'card',
          cardNumber: '1234567890',
        },
        amount: 99.99,
      });

      expect(order.orderId).toBe('ORD-123');
      expect((order.paymentMethod as any).type).toBe('card');
      expect((order.paymentMethod as any).cardNumber).toBe('1234567890');
      expect(order.amount).toBe(99.99);

      const errors = await validate(order);
      expect(errors).toHaveLength(0);
    });

    it('should serialize and deserialize discriminated union property', () => {
      const PaymentMethodSchema = z.discriminatedUnion('type', [
        z.object({
          type: z.literal('card'),
          cardNumber: z.string(),
        }),
        z.object({
          type: z.literal('paypal'),
          email: z.string().email(),
        }),
      ]);

      const OrderSchema = z.object({
        orderId: z.string(),
        paymentMethod: PaymentMethodSchema,
      });

      const Order = ValidatedDto(OrderSchema);

      const plainData = {
        orderId: 'ORD-456',
        paymentMethod: {
          type: 'paypal',
          email: 'user@example.com',
        },
      };

      // plainToInstance should properly deserialize the nested union
      const order = plainToInstance(Order, plainData);
      expect(order.orderId).toBe('ORD-456');
      expect((order.paymentMethod as any).type).toBe('paypal');
      expect((order.paymentMethod as any).email).toBe('user@example.com');

      // instanceToPlain should properly serialize
      const plain = instanceToPlain(order);
      expect(plain).toEqual(plainData);
    });

    it('should handle standard union as nested property', async () => {
      const ValueSchema = z.union([z.string().min(3), z.number().positive()]);

      const ConfigSchema = z.object({
        name: z.string(),
        value: ValueSchema,
      });

      const Config = ValidatedDto(ConfigSchema);

      // With string value
      const configString = new Config({
        name: 'setting1',
        value: 'hello',
      });

      expect(configString.name).toBe('setting1');
      // Value should be directly accessible, not wrapped
      expect(configString.value).toBe('hello');

      const stringErrors = await validate(configString);
      expect(stringErrors).toHaveLength(0);

      // With number value
      const configNumber = new Config({
        name: 'setting2',
        value: 42,
      });

      expect(configNumber.name).toBe('setting2');
      // Value should be directly accessible, not wrapped
      expect(configNumber.value).toBe(42);

      const numberErrors = await validate(configNumber);
      expect(numberErrors).toHaveLength(0);
    });

    it('should handle array of discriminated unions', async () => {
      const NotificationSchema = z.discriminatedUnion('channel', [
        z.object({
          channel: z.literal('email'),
          recipient: z.string().email(),
        }),
        z.object({
          channel: z.literal('sms'),
          phoneNumber: z.string(),
        }),
      ]);

      const CampaignSchema = z.object({
        name: z.string(),
        notifications: z.array(NotificationSchema),
      });

      const Campaign = ValidatedDto(CampaignSchema);

      const campaign = new Campaign({
        name: 'Spring Sale',
        notifications: [
          {
            channel: 'email',
            recipient: 'user@example.com',
          },
          {
            channel: 'sms',
            phoneNumber: '+1234567890',
          },
        ],
      });

      expect(campaign.name).toBe('Spring Sale');
      expect(campaign.notifications).toHaveLength(2);
      expect((campaign.notifications[0] as any).channel).toBe('email');
      expect((campaign.notifications[1] as any).channel).toBe('sms');

      const errors = await validate(campaign);
      expect(errors).toHaveLength(0);
    });

    it('should serialize and deserialize array of unions', () => {
      const ItemSchema = z.discriminatedUnion('type', [
        z.object({
          type: z.literal('product'),
          sku: z.string(),
          price: z.number(),
        }),
        z.object({
          type: z.literal('service'),
          name: z.string(),
          rate: z.number(),
        }),
      ]);

      const CartSchema = z.object({
        cartId: z.string(),
        items: z.array(ItemSchema),
      });

      const Cart = ValidatedDto(CartSchema);

      const plainData = {
        cartId: 'CART-789',
        items: [
          { type: 'product', sku: 'ABC-123', price: 29.99 },
          { type: 'service', name: 'Consulting', rate: 150 },
        ],
      };

      const cart = plainToInstance(Cart, plainData);
      expect(cart.cartId).toBe('CART-789');
      expect(cart.items).toHaveLength(2);
      expect((cart.items[0] as any).type).toBe('product');
      expect((cart.items[1] as any).type).toBe('service');

      const plain = instanceToPlain(cart);
      expect(plain).toEqual(plainData);
    });

    it('should validate nested union with invalid data', async () => {
      const PaymentMethodSchema = z.discriminatedUnion('type', [
        z.object({
          type: z.literal('card'),
          cardNumber: z.string().min(10),
        }),
        z.object({
          type: z.literal('paypal'),
          email: z.string().email(),
        }),
      ]);

      const OrderSchema = z.object({
        orderId: z.string(),
        paymentMethod: PaymentMethodSchema,
      });

      const Order = ValidatedDto(OrderSchema);

      // Invalid: cardNumber too short
      const invalidOrder = new Order({
        orderId: 'ORD-999',
        paymentMethod: {
          type: 'card',
          cardNumber: '123', // Too short
        },
      });

      const errors = await validate(invalidOrder);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should properly serialize discriminated union with excludeExtraneousValues', () => {
      const PaymentTermSchema = z.discriminatedUnion('type', [
        z.object({
          type: z.literal('installment'),
          numberOfInstallments: z.number(),
          intervalDays: z.number(),
        }),
        z.object({
          type: z.literal('upfront'),
          dueDate: z.string(),
        }),
      ]);

      const PaymentTerm = ValidatedDto(PaymentTermSchema);

      // Create instance with installment payment
      const installment = new PaymentTerm({
        type: 'installment',
        numberOfInstallments: 12,
        intervalDays: 30,
      });

      // Serialize with excludeExtraneousValues: true
      const plainInstallment = instanceToPlain(installment, {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      });

      expect(plainInstallment).toEqual({
        type: 'installment',
        numberOfInstallments: 12,
        intervalDays: 30,
      });

      // Create instance with upfront payment
      const upfront = new PaymentTerm({
        type: 'upfront',
        dueDate: '2024-12-31',
      });

      // Serialize with excludeExtraneousValues: true
      const plainUpfront = instanceToPlain(upfront, {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      });

      expect(plainUpfront).toEqual({
        type: 'upfront',
        dueDate: '2024-12-31',
      });
    });

    it('should properly serialize nested discriminated union property with excludeExtraneousValues', () => {
      // This simulates the Contract entity scenario
      const PaymentTermSchema = z.discriminatedUnion('paymentCondition', [
        z.object({
          paymentCondition: z.literal('cash'),
          totalValue: z.number(),
          dueDate: z.string(),
        }),
        z.object({
          paymentCondition: z.literal('installments'),
          totalValue: z.number(),
          numberOfInstallments: z.number(),
          intervalDays: z.number(),
        }),
      ]);

      const ContractSchema = z.object({
        contractNumber: z.string(),
        projectId: z.string(),
        paymentTerms: PaymentTermSchema,
      });

      const Contract = ValidatedDto(ContractSchema);

      // Create a contract with installments payment
      const contract = new Contract({
        contractNumber: 'CON-2024-000001',
        projectId: 'proj-123',
        paymentTerms: {
          paymentCondition: 'installments',
          totalValue: 10000,
          numberOfInstallments: 10,
          intervalDays: 30,
        },
      });

      // Serialize the entire contract with excludeExtraneousValues
      // This should now work properly with the fixed discriminated union factory!
      const plainContract = instanceToPlain(contract, {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      });

      // The factory now has intersection properties decorated with @Expose()
      // so nested discriminated unions serialize correctly
      expect(plainContract).toEqual({
        contractNumber: 'CON-2024-000001',
        projectId: 'proj-123',
        paymentTerms: {
          paymentCondition: 'installments',
          totalValue: 10000,
          numberOfInstallments: 10,
          intervalDays: 30,
        },
      });

      // Also test serializing just the paymentTerms property
      const plainPaymentTerms = instanceToPlain(contract.paymentTerms, {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      });

      expect(plainPaymentTerms).toEqual({
        paymentCondition: 'installments',
        totalValue: 10000,
        numberOfInstallments: 10,
        intervalDays: 30,
      });
    });
  });
  /**
   * Herdar de um DTO de união.
   *
   * Um `@ObjectType()` do Nest precisa dos decorators e do `design:type` na **classe final**, e num
   * mixin eles ficam na base gerada. O `@InheritValidatedMetadata()` é quem faz a travessia — e para
   * as uniões ele tem um caminho próprio, separado do caminho dos objetos. Um DTO de união que herde
   * sem ganhar a metadata compila e some do schema GraphQL: nenhum erro, nenhum campo.
   */
  describe('Herança de um DTO de união', () => {
    it('uma subclasse de união discriminada recebe a metadata da base', () => {
      // Arrange
      const marca = Symbol('marca');
      const Base = ValidatedDto(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('a'), a: z.string() }),
          z.object({ type: z.literal('b'), b: z.number() }),
        ]),
      );
      Reflect.defineMetadata(marca, 'da-base', Base);

      // Act
      @InheritValidatedMetadata()
      class Derivada extends Base {}

      // Assert
      expect(Reflect.getMetadata(marca, Derivada)).toBe('da-base');
      // e a fábrica continua roteando pelo discriminador, agora a partir da subclasse
      expect((new Derivada({ type: 'a', a: 'x' }) as any).a).toBe('x');
    });

    it('uma subclasse de união de objetos recebe a metadata da base', () => {
      // Arrange
      const marca = Symbol('marca');
      const Base = ValidatedDto(
        z.union([
          z.object({ kind: z.literal('texto'), texto: z.string() }),
          z.object({ kind: z.literal('numero'), numero: z.number() }),
        ]),
      );
      Reflect.defineMetadata(marca, 'da-base', Base);

      // Act
      @InheritValidatedMetadata()
      class Derivada extends Base {}

      // Assert
      expect(Reflect.getMetadata(marca, Derivada)).toBe('da-base');
    });

    /**
     * Uma união só de primitivos não tem campos para copiar — ela vira um wrapper com um `value`. O
     * que a subclasse precisa herdar é justamente o `design:type` e os decorators desse `value`.
     */
    /**
     * Uma união só de primitivos não tem campos para copiar — ela vira um wrapper com um `value`. O
     * que a subclasse precisa herdar é o que estiver pendurado nesse `value` (o `design:type` e o que
     * um `@Field()` deixe lá) e a metadata de classe.
     */
    it('uma subclasse de união de primitivos herda o que está no campo value e na classe', () => {
      // Arrange
      const marcaDeCampo = Symbol('campo');
      const marcaDeClasse = Symbol('classe');
      const Base = ValidatedDto(z.union([z.string(), z.number()]) as any);
      // é o que um `@Field()` do Nest deixaria no protótipo da base gerada
      Reflect.defineMetadata('design:type', String, Base.prototype, 'value');
      Reflect.defineMetadata(marcaDeCampo, 'do-campo', Base.prototype, 'value');
      Reflect.defineMetadata(marcaDeClasse, 'da-classe', Base);

      // Act
      @InheritValidatedMetadata()
      class Derivada extends Base {}

      // Assert
      expect(Reflect.getMetadata('design:type', Derivada.prototype, 'value')).toBe(String);
      expect(Reflect.getMetadata(marcaDeCampo, Derivada.prototype, 'value')).toBe('do-campo');
      expect(Reflect.getMetadata(marcaDeClasse, Derivada)).toBe('da-classe');
      expect((new Derivada('texto' as any) as any).value).toBe('texto');
    });
  });

  describe('Bordas', () => {
    /** O mixin atende objeto e união. Qualquer outra coisa é erro de uso, e ele diz qual. */
    it('recusa um schema que não é objeto nem união, nomeando o que aceita', () => {
      // Act / Assert
      expect(() => ValidatedDto(z.string() as any)).toThrow(
        /ZodObject, ZodUnion, or ZodDiscriminatedUnion/,
      );
      expect(() => ValidatedDto(z.array(z.string()) as any)).toThrow(
        /ZodObject, ZodUnion, or ZodDiscriminatedUnion/,
      );
    });

    /**
     * Construir com um payload que não casa com nenhuma opção **não** lança: o construtor guarda o
     * que veio, e quem recusa é a validação. É a mesma escolha do resto do projeto — construir não
     * valida, e o erro sai com a mensagem do schema, não com um `undefined` no meio do caminho.
     */
    it('um payload que não casa com opção nenhuma é guardado para a validação recusar', async () => {
      // Arrange
      const Forma = ValidatedDto(
        z.union([
          z.object({ kind: z.literal('circulo'), raio: z.number() }),
          z.object({ kind: z.literal('quadrado'), lado: z.number() }),
        ]),
      );

      // Act
      const nenhuma = new Forma({ kind: 'triangulo', base: 3 } as any);

      // Assert
      expect((nenhuma as any).kind).toBe('triangulo');
      expect((nenhuma as any).base).toBe(3);
      expect(await validate(nenhuma as object)).not.toHaveLength(0);
    });

    it('construir sem payload nenhum não estoura', () => {
      // Arrange
      const Forma = ValidatedDto(
        z.union([
          z.object({ kind: z.literal('circulo'), raio: z.number() }),
          z.object({ kind: z.literal('quadrado'), lado: z.number() }),
        ]),
      );

      // Act / Assert
      expect(() => new Forma(undefined as any)).not.toThrow();
    });
  });
});
