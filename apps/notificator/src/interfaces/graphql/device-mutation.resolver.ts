import {
  NotFoundException,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';

import { RegisterDeviceCommand } from '../../application/notification/command/register-device.command';
import { RemoveDeviceCommand } from '../../application/notification/command/remove-device.command';
import { FindDeviceQuery } from '../../application/notification/query/find-device.query';
import { CurrentNotifiable } from '../auth/current-notifiable.decorator';
import type { SessionNotifiable } from '../auth/session-notifiable.pipe';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { NotificationExceptionFilter } from '../filters/notification-exception.filter';
import { RegisterDeviceInputSchema } from './register-device.input';
import type { DeviceView } from './views';
import { deviceView } from './views';

@Resolver('Device')
@UseFilters(HttpExceptionFilter, NotificationExceptionFilter)
export class DeviceMutationResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Mutation('registerDevice')
  async registerDevice(
    @Args('input') input: unknown,
    @CurrentNotifiable() owner: SessionNotifiable,
  ): Promise<DeviceView> {
    if (!owner) throw new UnauthorizedException('the session has no user yet');
    const deviceId = await this.commandBus.execute(
      new RegisterDeviceCommand.RegisterDevice(
        RegisterDeviceInputSchema.parse(input),
        owner,
      ),
    );
    const device = await this.queryBus.execute(
      new FindDeviceQuery.FindDevice(deviceId),
    );
    if (!device) throw new NotFoundException('the device was not kept');
    return deviceView(device);
  }

  @Mutation('removeDevice')
  removeDevice(
    @Args('token') token: string,
    @CurrentNotifiable() owner: SessionNotifiable,
  ): Promise<boolean> {
    return owner
      ? this.commandBus.execute(
          new RemoveDeviceCommand.RemoveDevice(token, owner),
        )
      : Promise.resolve(false);
  }
}
