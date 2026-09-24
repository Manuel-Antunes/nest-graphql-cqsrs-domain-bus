import type { Mapper, MappingProfile } from '@automapper/core';
import { createMap, forMember, mapFrom } from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { Device } from '@nestposts/notifications/domain/device/device.entity';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';

import { DeviceView } from '../../dto/graphql/device.view';
import { NotificationView } from '../../dto/graphql/notification.view';

@Injectable()
export class NotificationProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      createMap(
        mapper,
        NotificationRecord,
        NotificationView,
        forMember(
          (view) => view.id,
          mapFrom((record) => record.id.value),
        ),
        forMember(
          (view) => view.type,
          mapFrom((record) => record.type),
        ),
        forMember(
          (view) => view.data,
          mapFrom((record) => record.data),
        ),
        forMember(
          (view) => view.read,
          mapFrom((record) => record.read),
        ),
        forMember(
          (view) => view.readAt,
          mapFrom((record) => record.readAt),
        ),
        forMember(
          (view) => view.createdAt,
          mapFrom((record) => record.createdAt),
        ),
      );

      createMap(
        mapper,
        Device,
        DeviceView,
        forMember(
          (view) => view.id,
          mapFrom((device) => device.id.value),
        ),
        forMember(
          (view) => view.deviceId,
          mapFrom((device) => device.deviceId),
        ),
        forMember(
          (view) => view.platform,
          mapFrom((device) => device.platform),
        ),
        forMember(
          (view) => view.createdAt,
          mapFrom((device) => device.createdAt),
        ),
      );
    };
  }
}
