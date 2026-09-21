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

      const validPayment = new PaymentMethod({
        type: 'card',
        cardNumber: '1234567890',
      });
      const validErrors = await validate(validPayment);
      expect(validErrors).toHaveLength(0);

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

      const stringValue = new Value('hello');
      expect(stringValue).toBeDefined();

      const numberValue = new Value(42);
      expect(numberValue).toBeDefined();

      const boolValue = new Value(true);
      expect(boolValue).toBeDefined();
    });

    it('should validate top-level standard union correctly', async () => {
      const ValueSchema = z.union([z.string().min(5), z.number().positive()]);

      const Value = ValidatedDto(ValueSchema);

      const validString = new Value('hello world');
      const stringErrors = await validate(validString);
      expect(stringErrors).toHaveLength(0);

      const validNumber = new Value(42);
      const numberErrors = await validate(validNumber);
      expect(numberErrors).toHaveLength(0);

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

      const order = plainToInstance(Order, plainData);
      expect(order.orderId).toBe('ORD-456');
      expect((order.paymentMethod as any).type).toBe('paypal');
      expect((order.paymentMethod as any).email).toBe('user@example.com');

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

      const configString = new Config({
        name: 'setting1',
        value: 'hello',
      });

      expect(configString.name).toBe('setting1');
      expect(configString.value).toBe('hello');

      const stringErrors = await validate(configString);
      expect(stringErrors).toHaveLength(0);

      const configNumber = new Config({
        name: 'setting2',
        value: 42,
      });

      expect(configNumber.name).toBe('setting2');
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

      const installment = new PaymentTerm({
        type: 'installment',
        numberOfInstallments: 12,
        intervalDays: 30,
      });

      const plainInstallment = instanceToPlain(installment, {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      });

      expect(plainInstallment).toEqual({
        type: 'installment',
        numberOfInstallments: 12,
        intervalDays: 30,
      });

      const upfront = new PaymentTerm({
        type: 'upfront',
        dueDate: '2024-12-31',
      });

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

      const plainContract = instanceToPlain(contract, {
        excludeExtraneousValues: true,
        enableImplicitConversion: true,
      });

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
  describe('Herança de um DTO de união', () => {
    it('uma subclasse de união discriminada recebe a metadata da base', () => {
      const marca = Symbol('marca');
      const Base = ValidatedDto(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('a'), a: z.string() }),
          z.object({ type: z.literal('b'), b: z.number() }),
        ]),
      );
      Reflect.defineMetadata(marca, 'da-base', Base);

      @InheritValidatedMetadata()
      class Derivada extends Base {}

      expect(Reflect.getMetadata(marca, Derivada)).toBe('da-base');
      expect((new Derivada({ type: 'a', a: 'x' }) as any).a).toBe('x');
    });

    it('uma subclasse de união de objetos recebe a metadata da base', () => {
      const marca = Symbol('marca');
      const Base = ValidatedDto(
        z.union([
          z.object({ kind: z.literal('texto'), texto: z.string() }),
          z.object({ kind: z.literal('numero'), numero: z.number() }),
        ]),
      );
      Reflect.defineMetadata(marca, 'da-base', Base);

      @InheritValidatedMetadata()
      class Derivada extends Base {}

      expect(Reflect.getMetadata(marca, Derivada)).toBe('da-base');
    });

    it('uma subclasse de união de primitivos herda o que está no campo value e na classe', () => {
      const marcaDeCampo = Symbol('campo');
      const marcaDeClasse = Symbol('classe');
      const Base = ValidatedDto(z.union([z.string(), z.number()]) as any);
      Reflect.defineMetadata('design:type', String, Base.prototype, 'value');
      Reflect.defineMetadata(marcaDeCampo, 'do-campo', Base.prototype, 'value');
      Reflect.defineMetadata(marcaDeClasse, 'da-classe', Base);

      @InheritValidatedMetadata()
      class Derivada extends Base {}

      expect(Reflect.getMetadata('design:type', Derivada.prototype, 'value')).toBe(String);
      expect(Reflect.getMetadata(marcaDeCampo, Derivada.prototype, 'value')).toBe('do-campo');
      expect(Reflect.getMetadata(marcaDeClasse, Derivada)).toBe('da-classe');
      expect((new Derivada('texto' as any) as any).value).toBe('texto');
    });
  });

  describe('Bordas', () => {
    it('recusa um schema que não é objeto nem união, nomeando o que aceita', () => {
      expect(() => ValidatedDto(z.string() as any)).toThrow(
        /ZodObject, ZodUnion, or ZodDiscriminatedUnion/,
      );
      expect(() => ValidatedDto(z.array(z.string()) as any)).toThrow(
        /ZodObject, ZodUnion, or ZodDiscriminatedUnion/,
      );
    });

    it('um payload que não casa com opção nenhuma é guardado para a validação recusar', async () => {
      const Forma = ValidatedDto(
        z.union([
          z.object({ kind: z.literal('circulo'), raio: z.number() }),
          z.object({ kind: z.literal('quadrado'), lado: z.number() }),
        ]),
      );

      const nenhuma = new Forma({ kind: 'triangulo', base: 3 } as any);

      expect((nenhuma as any).kind).toBe('triangulo');
      expect((nenhuma as any).base).toBe(3);
      expect(await validate(nenhuma as object)).not.toHaveLength(0);
    });

    it('construir sem payload nenhum não estoura', () => {
      const Forma = ValidatedDto(
        z.union([
          z.object({ kind: z.literal('circulo'), raio: z.number() }),
          z.object({ kind: z.literal('quadrado'), lado: z.number() }),
        ]),
      );

      expect(() => new Forma(undefined as any)).not.toThrow();
    });
  });
});
