import type { Database } from './database';

export class OrganizationRecords {
  constructor(private readonly database: Database) {}

  async slugOf(name: string): Promise<string> {
    const [row] = await this.database.query<{ slug: string }>(
      'select slug from organization where name = ?',
      name,
    );
    if (!row) {
      throw new Error(`no organization named ${name}`);
    }
    return row.slug;
  }

  async rolesOf(organization: string, credentialId: string): Promise<string[]> {
    const rows = await this.database.query<{ role: string }>(
      `select m.role from member m
         join organization o on o.id = m.organization_id
        where o.name = ? and m.user_id = ?`,
      organization,
      credentialId,
    );
    return rows.map((row) => row.role);
  }
}
