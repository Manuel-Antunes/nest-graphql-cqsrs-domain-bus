import type { Database } from './database';

export interface ChatwootAgent {
  readonly name: string;
  readonly email: string;
  readonly type: string | null;
}

export interface ChatwootAccount {
  readonly id: number;
  readonly status: number;
}

export type ChatwootSeat = 'administrator' | 'agent';

/**
 * Chatwoot's mirror of the platform, in the `chatwoot` schema of the same database: the agents,
 * accounts, seats and teams the platform's triggers keep there, and the links from its contacts to
 * the platform's clients.
 */
export class ChatwootRecords {
  constructor(private readonly database: Database) {}

  async agentOf(email: string): Promise<ChatwootAgent | undefined> {
    const [agent] = await this.database.query<ChatwootAgent>(
      'select name, email, type from chatwoot.users where email = lower(?)',
      email,
    );
    return agent;
  }

  async accountOf(organization: string): Promise<ChatwootAccount | undefined> {
    const [account] = await this.database.query<ChatwootAccount>(
      `select a.id, a.status from chatwoot.accounts a
         join organization o on o.id = a.platform_organization_id
        where o.name = ?`,
      organization,
    );
    return account;
  }

  async seatOf(
    organization: string,
    email: string,
  ): Promise<ChatwootSeat | undefined> {
    const [seat] = await this.database.query<{ role: number }>(
      `select au.role from chatwoot.account_users au
         join chatwoot.accounts a on a.id = au.account_id
         join organization o on o.id = a.platform_organization_id
         join chatwoot.users u on u.id = au.user_id
        where o.name = ? and u.email = lower(?)`,
      organization,
      email,
    );
    if (!seat) return undefined;
    return seat.role === 1 ? 'administrator' : 'agent';
  }

  async teamOf(team: string): Promise<string | undefined> {
    const [row] = await this.database.query<{ name: string }>(
      `select c.name from chatwoot.teams c
         join team t on t.id = c.platform_team_id
        where t.name = ?`,
      team,
    );
    return row?.name;
  }

  async clientLinkedTo(contact: string): Promise<string | undefined> {
    const [link] = await this.database.query<{ client_id: string }>(
      `select l.client_id from chatwoot.contact_links l
         join chatwoot.contacts c on c.id = l.contact_id
        where c.name = ?`,
      contact,
    );
    return link?.client_id;
  }
}
