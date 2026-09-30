import { OAuthProvider } from '../infrastructure/auth/oauth-provider';
import { ChatwootApi } from '../infrastructure/chatwoot/chatwoot-api';
import { AppendFaults } from '../infrastructure/database/append-faults';
import { ChatwootRecords } from '../infrastructure/database/chatwoot-records';
import { CredentialRecords } from '../infrastructure/database/credential-records';
import { Database } from '../infrastructure/database/database';
import { EventLog } from '../infrastructure/database/event-log';
import { MessageInbox } from '../infrastructure/database/message-inbox';
import { NotificationRecords } from '../infrastructure/database/notification-records';
import { OrganizationRecords } from '../infrastructure/database/organization-records';
import { PostRecords } from '../infrastructure/database/post-records';
import { SessionCache } from '../infrastructure/database/session-cache';
import { GraphqlEndpoints } from '../infrastructure/graphql/graphql-endpoints';
import { Mailbox } from '../infrastructure/mail/mailbox';
import { Broker } from '../infrastructure/messaging/broker';
import { Wire } from '../infrastructure/messaging/wire';
import { BillingRun } from '../infrastructure/polar/billing-run';
import { BillingWebhooks } from '../infrastructure/polar/billing-webhooks';
import { Storage } from '../infrastructure/storage/storage';
import { test as environment } from './environment.fixtures';

export interface InfrastructureFixtures {
  database: Database;
  postRecords: PostRecords;
  eventLog: EventLog;
  inbox: MessageInbox;
  credentialRecords: CredentialRecords;
  organizationRecords: OrganizationRecords;
  notificationRecords: NotificationRecords;
  /** Chatwoot's mirror of the platform, and the links from its contacts to the platform's clients. */
  chatwootRecords: ChatwootRecords;
  /** Chatwoot reached directly, past the web and the gateway. */
  chatwoot: ChatwootApi;
  appendFaults: AppendFaults;
  /** Every email the stack sent, as Mailpit received it. */
  mailbox: Mailbox;
  storage: Storage;
  broker: Broker;
  /** What went on the wire, whichever wire this run used — see `infrastructure/messaging/wire.ts`. */
  wire: (queue: string) => Wire;
  endpoints: GraphqlEndpoints;
  oauthProvider: OAuthProvider;
  /** Polar's sandbox and this run's webhook endpoint — `null` when the run has no billing. */
  billing: BillingRun | null;
  billingWebhooks: BillingWebhooks;
}

/**
 * The three things a browser cannot see: each service's durable state, the broker's topology, and
 * the inbox every email lands in.
 *
 * A Playwright test is Node, so the assertions that used to need a second suite live here — which is
 * what lets one test say "the page shows this, and this is what the other process actually kept".
 */
export const test = environment.extend<InfrastructureFixtures>({
  database: async ({ environment }, use) => {
    await use(Database.ofTenant(environment.postgresUrl));
  },

  postRecords: async ({ database }, use) => {
    await use(new PostRecords(database));
  },

  eventLog: async ({ database }, use) => {
    await use(new EventLog(database));
  },

  inbox: async ({ database }, use) => {
    await use(new MessageInbox(database));
  },

  credentialRecords: async ({ database, environment }, use) => {
    await use(
      new CredentialRecords(database, new SessionCache(environment.redisUrl)),
    );
  },

  organizationRecords: async ({ database }, use) => {
    await use(new OrganizationRecords(database));
  },

  notificationRecords: async ({ database }, use) => {
    await use(new NotificationRecords(database));
  },

  chatwootRecords: async ({ database }, use) => {
    await use(new ChatwootRecords(database));
  },

  chatwoot: async ({ environment }, use) => {
    await use(new ChatwootApi(environment.chatwootUrl));
  },

  appendFaults: async ({ database }, use) => {
    const faults = new AppendFaults(database);
    await use(faults);
    await faults.clear();
  },

  mailbox: async ({ environment }, use) => {
    await use(new Mailbox(environment.mailboxUrl));
  },

  storage: async ({ environment }, use) => {
    const storage = new Storage(environment.storageUrl);
    await use(storage);
    storage.close();
  },

  broker: async ({ environment }, use) => {
    await use(
      new Broker(
        environment.managementUrl,
        environment.brokerUser,
        environment.brokerPassword,
      ),
    );
  },

  wire: async ({ environment }, use) => {
    await use((queue) => Wire.forTransport(environment, queue));
  },

  endpoints: async ({ environment }, use) => {
    const endpoints = new GraphqlEndpoints(environment);
    await use(endpoints);
    await endpoints.close();
  },

  oauthProvider: async ({ environment }, use) => {
    await use(new OAuthProvider(environment.webUrl));
  },

  billing: async ({}, use) => {
    await use(BillingRun.current());
  },

  billingWebhooks: async ({ environment }, use) => {
    await use(new BillingWebhooks(environment.webUrl));
  },
});
