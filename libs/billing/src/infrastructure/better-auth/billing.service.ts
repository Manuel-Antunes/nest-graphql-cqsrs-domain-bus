import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { BetterAuthWith } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { RequestHeaders } from '@nestposts/auth/infrastructure/better-auth/request-headers';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';

import type { PolarBetterAuthPluginProvider } from './polar-better-auth.plugin';

type PolarApi = BetterAuthWith<[typeof PolarBetterAuthPluginProvider]>['api'];

type Input<E extends keyof PolarApi, K extends 'query' | 'body'> = NonNullable<
  NonNullable<Parameters<PolarApi[E]>[0]>[K]
>;

@Injectable({ scope: Scope.REQUEST })
export class BillingService {
  private readonly headers: Headers;

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: { api: PolarApi },
    @Inject(REQUEST) request: unknown,
  ) {
    this.headers = RequestHeaders.from(request);
  }

  state() {
    return this.auth.api.state({ headers: this.headers });
  }

  async portalUrl(): Promise<string> {
    const { url } = await this.auth.api.portal({
      headers: this.headers,
      body: { redirect: false },
    });
    return url;
  }

  subscriptions(query: Input<'subscriptions', 'query'> = {}) {
    return this.auth.api.subscriptions({ headers: this.headers, query });
  }

  orders(query: Input<'orders', 'query'> = {}) {
    return this.auth.api.orders({ headers: this.headers, query });
  }

  benefits(query: Input<'benefits', 'query'> = {}) {
    return this.auth.api.benefits({ headers: this.headers, query });
  }

  meters(query: Input<'meters', 'query'> = {}) {
    return this.auth.api.meters({ headers: this.headers, query });
  }

  ingest(event: string, metadata: Input<'ingestion', 'body'>['metadata']) {
    return this.auth.api.ingestion({
      headers: this.headers,
      body: { event, metadata },
    });
  }

  async checkoutUrl(body: Omit<Input<'checkout', 'body'>, 'redirect'>) {
    const { url } = await this.auth.api.checkout({
      headers: this.headers,
      body: { ...body, redirect: false },
    });
    return url;
  }
}
