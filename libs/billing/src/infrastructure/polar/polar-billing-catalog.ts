import { Inject, Injectable } from '@nestjs/common';
import { Polar } from '@polar-sh/sdk';
import type { Product } from '@polar-sh/sdk/models/components/product.js';

import { BillingCatalog } from '../../domain/billing/billing-catalog';
import type { Plan } from '../../domain/billing/plan';
import { ExpiringValue } from './expiring-value';
import { PolarPlans } from './polar-plans';

const CATALOG_TTL_MS = 5 * 60_000;
const PAGE_SIZE = 100;

@Injectable()
export class PolarBillingCatalog extends BillingCatalog {
  private readonly catalog = new ExpiringValue(CATALOG_TTL_MS, () =>
    this.load(),
  );

  constructor(@Inject(Polar) private readonly polar: Polar) {
    super();
  }

  plans(): Promise<Plan[]> {
    return this.catalog.get();
  }

  private async load(): Promise<Plan[]> {
    const products: Product[] = [];
    const pages = await this.polar.products.list({
      isArchived: false,
      limit: PAGE_SIZE,
    });
    for await (const page of pages) {
      products.push(...page.result.items);
    }
    return PolarPlans.fromProducts(products);
  }
}
