import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Device } from '@nestposts/notifications/domain/device/device.entity';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { RegisterDeviceCommand } from '../../application/notification/command/register-device.command';
import { RemoveDeviceCommand } from '../../application/notification/command/remove-device.command';
import { FindDeviceQuery } from '../../application/notification/query/find-device.query';
import { DeviceView } from '../../dto/graphql/device.view';
import { RegisterDeviceInput } from '../../dto/graphql/register-device.input';
import { CurrentUser } from '../decorators/current-user.decorator';

@Resolver('Device')
export class DeviceMutationResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Mutation('registerDevice')
  @UseInterceptors(MapInterceptor(Device, DeviceView))
  async registerDevice(
    @Args('input') input: RegisterDeviceInput,
    @CurrentUser() user: User,
  ): Promise<Device | null> {
    const deviceId = await this.commandBus.execute(
      new RegisterDeviceCommand.RegisterDevice(input, user),
    );
    return this.queryBus.execute(new FindDeviceQuery.FindDevice(deviceId));
  }

  @Mutation('removeDevice')
  removeDevice(
    @Args('token') token: string,
    @CurrentUser() user: User,
  ): Promise<boolean> {
    return this.commandBus.execute(
      new RemoveDeviceCommand.RemoveDevice(token, user),
    );
  }
}
