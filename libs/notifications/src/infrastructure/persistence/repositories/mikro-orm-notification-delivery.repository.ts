import { EntityManager, TransactionPropagation } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

import { NotificationDelivery } from '../../../domain/delivery/notification-delivery';
import { NotificationDeliveryRepository } from '../../../domain/delivery/notification-delivery.repository';
import type { NotificationId } from '../../../domain/notification/vo/notification-id';

@Injectable()
export class MikroOrmNotificationDeliveryRepository extends NotificationDeliveryRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  deliveredChannels(
    notificationId: NotificationId,
  ): Promise<ReadonlySet<string>> {
    return inRequestContext(this.em, async () => {
      const deliveries = await this.em.find(NotificationDelivery, {
        notificationId: notificationId.value,
      });
      return new Set(deliveries.map((delivery) => delivery.channel));
    });
  }

  async record(delivery: NotificationDelivery): Promise<void> {
    await inRequestContext(this.em, () =>
      this.em.getContext().upsert(NotificationDelivery, delivery, {
        onConflictFields: ['notificationId', 'channel'],
        onConflictAction: 'ignore',
      }),
    );
  }

  async recordAfter(
    delivery: NotificationDelivery,
    send: () => Promise<void>,
  ): Promise<void> {
    await inRequestContext(this.em, () =>
      this.em.transactional(
        async () => {
          await send();
          await this.record(delivery);
        },
        { propagation: TransactionPropagation.REQUIRES_NEW },
      ),
    );
  }
}
