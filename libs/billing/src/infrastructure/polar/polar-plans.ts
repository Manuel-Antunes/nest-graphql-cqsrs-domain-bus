import type { Product } from '@polar-sh/sdk/models/components/product.js';

import type { Plan, PlanInterval, PlanPrice } from '../../domain/billing/plan';
import { MarkdownText } from './markdown-text';

type ProductPrice = Product['prices'][number];

export class PolarPlans {
  static fromProducts(products: readonly Product[]): Plan[] {
    return products
      .filter((product) => !product.isArchived)
      .map(PolarPlans.fromProduct)
      .filter((plan): plan is Plan => plan !== null)
      .sort(
        (left, right) => PolarPlans.cheapest(left) - PolarPlans.cheapest(right),
      );
  }

  static fromProduct(product: Product): Plan | null {
    const prices = product.prices
      .filter((price) => !price.isArchived)
      .map((price) => PolarPlans.priceOf(product, price))
      .filter((price): price is PlanPrice => price !== null);
    if (prices.length === 0) {
      return null;
    }

    const { prose, items } = MarkdownText.split(product.description ?? '');
    const features =
      items.length > 0
        ? items
        : product.benefits
            .map((benefit) => MarkdownText.inline(benefit.description))
            .filter(Boolean);
    const highlighted = product.metadata.highlighted;

    return {
      id: product.id,
      name: product.name,
      ...(prose ? { description: prose } : {}),
      prices,
      ...(features.length > 0 ? { features } : {}),
      ...(highlighted === true || highlighted === 'true'
        ? { highlighted: true }
        : {}),
    };
  }

  private static priceOf(
    product: Product,
    price: ProductPrice,
  ): PlanPrice | null {
    const amount = PolarPlans.amountOf(price);
    const interval = PolarPlans.intervalOf(product, price);
    if (amount === null || interval === null) {
      return null;
    }
    const intervalCount = product.recurringIntervalCount ?? 1;

    return {
      id: price.id,
      amount,
      currency: price.priceCurrency,
      interval,
      ...(intervalCount > 1 ? { intervalCount } : {}),
    };
  }

  private static amountOf(price: ProductPrice): number | null {
    switch (price.amountType) {
      case 'fixed':
        return price.priceAmount;
      case 'free':
        return 0;
      case 'custom':
        return price.presetAmount ?? price.minimumAmount;
      default:
        return null;
    }
  }

  private static intervalOf(
    product: Product,
    price: ProductPrice,
  ): PlanInterval | null {
    if (!product.isRecurring) {
      return 'one-time';
    }
    const recurring =
      ('recurringInterval' in price ? price.recurringInterval : null) ??
      product.recurringInterval;
    if (recurring === 'month') {
      return 'month';
    }
    return recurring === 'year' ? 'year' : null;
  }

  private static cheapest(plan: Plan): number {
    return Math.min(...plan.prices.map((price) => price.amount));
  }
}
