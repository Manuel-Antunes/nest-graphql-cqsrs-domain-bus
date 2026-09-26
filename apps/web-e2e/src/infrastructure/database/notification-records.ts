import type { Database } from './database';

export interface StoredNotification {
  id: string;
  type: string;
  notifiable_type: string;
  data: { postId: string; title: string; url: string };
  read_at: string | null;
}

export class NotificationRecords {
  constructor(private readonly database: Database) {}

  aboutPost(postId: string): Promise<StoredNotification[]> {
    return this.database.query<StoredNotification>(
      `select id, type, notifiable_type, data, read_at
         from notifications
        where data ->> 'postId' = ?`,
      postId,
    );
  }

  toUserAboutPost(
    email: string,
    postId: string,
  ): Promise<StoredNotification[]> {
    return this.database.query<StoredNotification>(
      `select n.id, n.type, n.notifiable_type, n.data, n.read_at
         from notifications n
         join users u on u.id = n.notifiable_id
        where u.email = ? and n.data ->> 'postId' = ?`,
      email,
      postId,
    );
  }

  async channelsThatDelivered(notificationId: string): Promise<string[]> {
    const rows = await this.database.query<{ channel: string }>(
      'select channel from notification_deliveries where notification_id = ? order by channel',
      notificationId,
    );
    return rows.map((row) => row.channel);
  }
}
