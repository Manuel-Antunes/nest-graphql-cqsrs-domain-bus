import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

import { Device } from '../../../domain/device/device.entity';
import { DeviceRepository } from '../../../domain/device/device.repository';
import type { DeviceId } from '../../../domain/device/vo/device-id';

@Injectable()
export class MikroOrmDeviceRepository extends DeviceRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(device: Device): Promise<void> {
    await this.em.persist(device).flush();
  }

  async remove(device: Device): Promise<void> {
    await this.em.remove(device).flush();
  }

  findById(id: DeviceId): Promise<Device | null> {
    return inRequestContext(this.em, () => this.em.findOne(Device, { id }));
  }

  findByToken(token: string): Promise<Device | null> {
    return inRequestContext(this.em, () => this.em.findOne(Device, { token }));
  }

  findByNotifiable(
    notifiableType: string,
    notifiableId: string,
  ): Promise<Device[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        Device,
        { notifiableType, notifiableId },
        { orderBy: { createdAt: 'asc' } },
      ),
    );
  }
}
