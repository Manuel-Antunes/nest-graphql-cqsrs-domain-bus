export class BillingWebhooks {
  static readonly PATH = '/api/auth/polar/webhooks';

  constructor(private readonly webUrl: string) {}

  get url(): string {
    return `${this.webUrl}${BillingWebhooks.PATH}`;
  }

  async forge(type: string, customerExternalId: string): Promise<number> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': `msg_${Date.now()}`,
        'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
        'webhook-signature': 'v1,Zm9yZ2Vk',
      },
      body: JSON.stringify({
        type,
        data: { customer: { external_id: customerExternalId } },
      }),
    });
    return response.status;
  }
}
