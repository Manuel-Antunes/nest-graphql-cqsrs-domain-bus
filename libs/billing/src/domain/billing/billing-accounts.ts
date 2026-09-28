export interface BillingCustomer {
  id: string;
  email: string;
  name: string;
}

export abstract class BillingAccounts {
  abstract isSubscribed(customerId: string): Promise<boolean>;

  abstract ensureCustomer(customer: BillingCustomer): Promise<void>;
}
