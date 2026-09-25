import type { Product } from '@polar-sh/sdk/models/components/product.js';

import { PolarPlans } from './polar-plans';

const price = (overrides: Record<string, unknown>) =>
  ({
    createdAt: new Date(),
    modifiedAt: null,
    source: 'catalog',
    taxBehavior: null,
    isArchived: false,
    productId: 'product',
    priceCurrency: 'brl',
    ...overrides,
  }) as Product['prices'][number];

const product = (overrides: Partial<Product> & { id: string }): Product =>
  ({
    createdAt: new Date(),
    modifiedAt: null,
    trialInterval: null,
    trialIntervalCount: null,
    name: overrides.id,
    description: null,
    visibility: 'public',
    recurringInterval: 'month',
    recurringIntervalCount: 1,
    isRecurring: true,
    isArchived: false,
    organizationId: 'org',
    metadata: {},
    prices: [
      price({
        id: `${overrides.id}-price`,
        amountType: 'fixed',
        priceAmount: 1000,
      }),
    ],
    benefits: [],
    medias: [],
    attachedCustomFields: [],
    ...overrides,
  }) as Product;

describe('PolarPlans', () => {
  it('turns a monthly product into a plan whose id is the product id and whose features are its benefits', () => {
    const [plan] = PolarPlans.fromProducts([
      product({
        id: 'starter',
        name: 'Starter',
        description: 'For one person',
        prices: [
          price({ id: 'starter-brl', amountType: 'fixed', priceAmount: 49700 }),
        ],
        benefits: [
          { description: 'Contatos Starter' },
          { description: 'Tokens' },
        ] as Product['benefits'],
      }),
    ]);

    expect(plan).toEqual({
      id: 'starter',
      name: 'Starter',
      description: 'For one person',
      prices: [
        {
          id: 'starter-brl',
          amount: 49700,
          currency: 'brl',
          interval: 'month',
        },
      ],
      features: ['Contatos Starter', 'Tokens'],
    });
  });

  it('reads a Markdown description as prose for the description and its list as the features', () => {
    const plan = PolarPlans.fromProduct(
      product({
        id: 'pro',
        description:
          '**Contatos:** 3.000 no ciclo\n\n- Todos os canais\n- Suporte prioritário',
        benefits: [{ description: 'Contatos Pro' }] as Product['benefits'],
      }),
    );

    expect(plan?.description).toBe('Contatos: 3.000 no ciclo');
    expect(plan?.features).toEqual(['Todos os canais', 'Suporte prioritário']);
  });

  it('orders the plans by their cheapest price', () => {
    const plans = PolarPlans.fromProducts([
      product({
        id: 'max',
        prices: [price({ id: 'm', amountType: 'fixed', priceAmount: 249700 })],
      }),
      product({
        id: 'starter',
        prices: [price({ id: 's', amountType: 'fixed', priceAmount: 49700 })],
      }),
      product({
        id: 'pro',
        prices: [price({ id: 'p', amountType: 'fixed', priceAmount: 119700 })],
      }),
    ]);

    expect(plans.map(({ id }) => id)).toEqual(['starter', 'pro', 'max']);
  });

  it('keeps the prices a plan can show and drops a product left with none', () => {
    const plans = PolarPlans.fromProducts([
      product({ id: 'archived', isArchived: true }),
      product({ id: 'weekly', recurringInterval: 'week' }),
      product({
        id: 'metered',
        prices: [
          price({ id: 'u', amountType: 'metered_unit', unitAmount: '1' }),
        ] as Product['prices'],
      }),
      product({
        id: 'mixed',
        prices: [
          price({
            id: 'old',
            amountType: 'fixed',
            priceAmount: 500,
            isArchived: true,
          }),
          price({ id: 'current', amountType: 'fixed', priceAmount: 900 }),
        ],
      }),
    ]);

    expect(plans).toHaveLength(1);
    expect(plans[0]?.prices.map(({ id }) => id)).toEqual(['current']);
  });

  it('reads a one-time, a free and a pay-what-you-want price', () => {
    const [lifetime, free, tip] = [
      PolarPlans.fromProduct(
        product({
          id: 'lifetime',
          isRecurring: false,
          recurringInterval: null,
        }),
      ),
      PolarPlans.fromProduct(
        product({
          id: 'free',
          prices: [price({ id: 'f', amountType: 'free' })],
        }),
      ),
      PolarPlans.fromProduct(
        product({
          id: 'tip',
          prices: [
            price({
              id: 't',
              amountType: 'custom',
              minimumAmount: 100,
              presetAmount: 500,
              maximumAmount: null,
            }),
          ],
        }),
      ),
    ];

    expect(lifetime?.prices[0]?.interval).toBe('one-time');
    expect(free?.prices[0]?.amount).toBe(0);
    expect(tip?.prices[0]?.amount).toBe(500);
  });

  it('highlights a product whose metadata says so, and counts intervals beyond one', () => {
    const plan = PolarPlans.fromProduct(
      product({
        id: 'yearly',
        recurringInterval: 'year',
        recurringIntervalCount: 2,
        metadata: { highlighted: 'true' },
      }),
    );

    expect(plan?.highlighted).toBe(true);
    expect(plan?.prices[0]).toMatchObject({
      interval: 'year',
      intervalCount: 2,
    });
  });
});
