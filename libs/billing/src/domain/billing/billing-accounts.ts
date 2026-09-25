import type { BillingState } from './billing-state';

export interface BillingCustomer {
  id: string;
  email: string;
  name: string;
}

export abstract class BillingAccounts {
  abstract stateOf(customer: BillingCustomer): Promise<BillingState>;

  abstract isSubscribed(customerId: string): Promise<boolean>;

  abstract portalFor(
    customer: BillingCustomer,
    returnUrl: string,
  ): Promise<string>;
}
