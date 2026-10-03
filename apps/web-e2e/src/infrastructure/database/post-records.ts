import { Poll } from '../../support/poll';
import type { Database } from './database';

export interface StoredPost {
  title: string;
  version: number;
  published_at: Date | null;
}

export interface AuthoredPost extends StoredPost {
  id: string;
  author_id: string;
}

export interface StoredAttachment {
  asset: {
    disk: string;
    path: string;
    originalName: string;
    size: number;
    extname: string;
    mimeType: string;
  } | null;
  deleted_at: Date | null;
}

export class PostRecords {
  constructor(private readonly database: Database) {}

  async find(id: string): Promise<StoredPost | undefined> {
    const [row] = await this.database.query<StoredPost>(
      'select title, version, published_at from posts where id = ?',
      id,
    );
    return row;
  }

  async titled(title: string): Promise<AuthoredPost | undefined> {
    const [row] = await this.database.query<AuthoredPost>(
      'select id, author_id, title, version, published_at from posts where title = ?',
      title,
    );
    return row;
  }

  whenVersion(
    id: string,
    version: number,
    timeoutMs: number,
  ): Promise<StoredPost | undefined> {
    return Poll.until(async () => {
      const post = await this.find(id);
      return post?.version === version ? post : undefined;
    }, timeoutMs);
  }

  async attachmentOf(id: string): Promise<StoredAttachment | undefined> {
    const [row] = await this.database.query<StoredAttachment>(
      'select asset, deleted_at from posts where id = ?',
      id,
    );
    return row;
  }

  async tagsOf(id: string): Promise<string[]> {
    const rows = await this.database.query<{ name: string }>(
      'select t.name from posts_tags pt join tags t on t.id = pt.tag_id where pt.post_id = ? order by t.name',
      id,
    );
    return rows.map((row) => row.name);
  }

  count(...titles: string[]): Promise<number> {
    return this.database.count(
      `select count(*) as total from posts where title in (${titles.map(() => '?').join(', ')})`,
      ...titles,
    );
  }

  async titlesInTenant(tenant: string): Promise<string[]> {
    const rows = await this.database.query<{ title: string }>(
      `select title from "tenant_${tenant}".posts order by created_at`,
    );
    return rows.map((row) => row.title);
  }

  async existsInTenant(tenant: string, id: string): Promise<boolean> {
    const rows = await this.database.query(
      `select id from "tenant_${tenant}".posts where id = ?`,
      id,
    );
    return rows.length === 1;
  }
}
