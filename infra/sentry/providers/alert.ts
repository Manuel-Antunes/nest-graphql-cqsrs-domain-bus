/// <reference path="../../../.sst/platform/config.d.ts" />

import { SENTRY_BASE_URL, SENTRY_TOKEN } from '../config';

/**
 * Who an alert notifies. `email` (with an empty `url`) mails the members of the project's teams;
 * `discord`, `webhook`, `googlechat`, `teams` and `ntfy` post to the `url`.
 */
export type AlertRecipient = {
  recipientType: string;
  url: string;
};

interface Inputs {
  baseUrl: string;
  token: string;
  organization: string;
  project: string;
  name: string;
  timespanMinutes: number;
  quantity: number;
  uptime: boolean;
  recipients: AlertRecipient[];
}

interface Outputs extends Inputs {
  alertId: string;
}

type ApiAlert = {
  id: number;
  name: string;
  timespanMinutes: number;
  quantity: number;
  uptime: boolean;
  alertRecipients: (AlertRecipient & { id: number })[];
};

class Provider implements $util.dynamic.ResourceProvider {
  async create(inputs: Inputs): Promise<$util.dynamic.CreateResult<Outputs>> {
    const existing = await this.find(inputs);
    const alert = existing
      ? await this.call<ApiAlert>(inputs, `alerts/${existing.id}/`, 'PUT')
      : await this.call<ApiAlert>(inputs, 'alerts/', 'POST');

    return {
      id: String(alert.id),
      outs: { ...inputs, alertId: String(alert.id) },
    };
  }

  async read(
    id: string,
    props: Inputs,
  ): Promise<$util.dynamic.ReadResult<Outputs>> {
    const alerts = await this.list(props);
    const alert = alerts.find((candidate) => String(candidate.id) === id);
    if (!alert) return { id: undefined };

    return { id, props: { ...props, ...this.fromApi(alert), alertId: id } };
  }

  async update(
    id: string,
    _olds: Outputs,
    news: Inputs,
  ): Promise<$util.dynamic.UpdateResult<Outputs>> {
    const alert = await this.call<ApiAlert>(news, `alerts/${id}/`, 'PUT');
    return { outs: { ...news, alertId: String(alert.id) } };
  }

  async delete(id: string, props: Inputs): Promise<void> {
    await this.call(props, `alerts/${id}/`, 'DELETE');
  }

  async diff(
    _id: string,
    olds: Outputs,
    news: Inputs,
  ): Promise<$util.dynamic.DiffResult> {
    const replaces = (['organization', 'project'] as const).filter(
      (key) => olds[key] !== news[key],
    );

    return {
      replaces,
      deleteBeforeReplace: true,
      changes:
        replaces.length > 0 ||
        JSON.stringify(this.body(olds)) !== JSON.stringify(this.body(news)),
    };
  }

  private body(inputs: Inputs) {
    return {
      name: inputs.name,
      timespanMinutes: inputs.timespanMinutes,
      quantity: inputs.quantity,
      uptime: inputs.uptime,
      alertRecipients: inputs.recipients,
    };
  }

  private fromApi(alert: ApiAlert) {
    return {
      name: alert.name,
      timespanMinutes: alert.timespanMinutes,
      quantity: alert.quantity,
      uptime: alert.uptime,
      recipients: alert.alertRecipients.map((recipient) => ({
        recipientType: recipient.recipientType,
        url: recipient.url,
      })),
    };
  }

  private async list(inputs: Inputs) {
    return this.call<ApiAlert[]>(inputs, 'alerts/', 'GET');
  }

  private async find(inputs: Inputs) {
    const alerts = await this.list(inputs);
    return alerts.find((alert) => alert.name === inputs.name);
  }

  private async call<T>(
    inputs: Inputs,
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ): Promise<T> {
    const url = `${inputs.baseUrl.replace(/\/?$/, '/')}0/projects/${inputs.organization}/${inputs.project}/${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${inputs.token}`,
        'Content-Type': 'application/json',
      },
      body:
        method === 'POST' || method === 'PUT'
          ? JSON.stringify(this.body(inputs))
          : undefined,
    });

    if (!response.ok) {
      throw new Error(
        `GlitchTip ${method} ${url} failed: ${response.status} ${await response.text()}`,
      );
    }

    if (response.status === 204) return undefined as T;

    return (await response.json()) as T;
  }
}

export interface GlitchtipAlertArgs {
  organization: $util.Input<string>;
  project: $util.Input<string>;
  name: $util.Input<string>;
  timespanMinutes: $util.Input<number>;
  quantity: $util.Input<number>;
  uptime: $util.Input<boolean>;
  recipients: $util.Input<AlertRecipient[]>;
}

/**
 * **A GlitchTip alert: `quantity` events within `timespanMinutes` notify the `recipients`.**
 *
 * GlitchTip alerts are not Sentry rules. Sentry's `/projects/{org}/{project}/rules/` answers 404
 * there, so `sentry.SentryRule` and its siblings cannot drive them; GlitchTip exposes its own
 * `/alerts/` endpoint with its own schema, hence a dynamic provider — the shape SST uses for its own
 * Cloudflare and Vercel resources.
 *
 * An alert has no natural key in GlitchTip, so its `name`, within its project, is the identity:
 * creating one adopts an alert of the same name rather than leaving two firing at the same
 * recipients. The token and the recipients are secrets in the state — a webhook URL is a bearer
 * credential for the channel it posts to.
 */
export class GlitchtipAlert extends $util.dynamic.Resource {
  declare readonly alertId: $util.Output<string>;

  constructor(
    name: string,
    args: GlitchtipAlertArgs,
    opts?: $util.CustomResourceOptions,
  ) {
    super(
      new Provider(),
      `${name}.glitchtip.Alert`,
      {
        ...args,
        baseUrl: SENTRY_BASE_URL,
        token: $util.secret(SENTRY_TOKEN),
        recipients: $util.secret(args.recipients),
        alertId: undefined,
      },
      opts,
    );
  }
}
