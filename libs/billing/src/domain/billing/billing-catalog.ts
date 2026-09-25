import type { Plan } from './plan';

export abstract class BillingCatalog {
  abstract plans(): Promise<Plan[]>;
}
