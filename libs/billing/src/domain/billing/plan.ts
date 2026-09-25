export type PlanInterval = 'one-time' | 'month' | 'year';

export interface PlanPrice {
  id: string;
  amount: number;
  currency: string;
  interval: PlanInterval;
  intervalCount?: number;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  prices: PlanPrice[];
  features?: string[];
  highlighted?: boolean;
}
