export interface E2eProduct {
  id: string;
  name: string;
  amount: number;
  currency: string;
}

export interface E2eProducts {
  free: E2eProduct;
  pro: E2eProduct;
}

export class Price {
  static monthlyOf({ amount, currency }: E2eProduct): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  }
}
