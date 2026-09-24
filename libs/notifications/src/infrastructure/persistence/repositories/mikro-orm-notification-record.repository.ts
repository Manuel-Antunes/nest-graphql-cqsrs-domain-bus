import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

import { NotificationRecord } from '../../../domain/notification/notification-record.entity';
import type { NotificationPage } from '../../../domain/notification/notification-record.repository';
import { NotificationRecordRepository } from '../../../domain/notification/notification-record.repository';
import type { NotificationId } from '../../../domain/notification/vo/notification-id';

const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class MikroOrmNotificationRecordRepository extends NotificationRecordRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async saveIfAbsent(record: NotificationRecord): Promise<boolean> {
    return inRequestContext(this.em, async () => {
      const em = this.em.getContext();
      if (await em.count(NotificationRecord, { id: record.id })) return false;
      await em.upsert(NotificationRecord, record, {
        onConflictFields: ['id'],
        onConflictAction: 'ignore',
      });
      return true;
    });
  }

  async save(record: NotificationRecord): Promise<void> {
    await this.em.persist(record).flush();
  }

  async saveAll(records: readonly NotificationRecord[]): Promise<void> {
    await this.em.persist([...records]).flush();
  }

  async remove(record: NotificationRecord): Promise<void> {
    await this.em.remove(record).flush();
  }

  findById(id: NotificationId): Promise<NotificationRecord | null> {
    return inRequestContext(this.em, () =>
      this.em.findOne(NotificationRecord, { id }),
    );
  }

  findByNotifiable(
    notifiableType: string,
    notifiableId: string,
    { unreadOnly = false, limit = DEFAULT_PAGE_SIZE }: NotificationPage = {},
  ): Promise<NotificationRecord[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        NotificationRecord,
        {
          notifiableType,
          notifiableId,
          ...(unreadOnly ? { readAt: null } : {}),
        },
        { orderBy: { createdAt: 'desc', id: 'desc' }, limit },
      ),
    );
  }

  findUnreadByNotifiable(
    notifiableType: string,
    notifiableId: string,
  ): Promise<NotificationRecord[]> {
    return inRequestContext(this.em, () =>
      this.em.find(NotificationRecord, {
        notifiableType,
        notifiableId,
        readAt: null,
      }),
    );
  }

  countUnread(notifiableType: string, notifiableId: string): Promise<number> {
    return inRequestContext(this.em, () =>
      this.em.count(NotificationRecord, {
        notifiableType,
        notifiableId,
        readAt: null,
      }),
    );
  }
}
