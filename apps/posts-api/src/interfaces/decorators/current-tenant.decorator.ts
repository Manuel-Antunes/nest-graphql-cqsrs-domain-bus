import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { HeaderTenantResolver } from '@nestposts/database';

export const CurrentTenant = createParamDecorator((_: unknown, context: ExecutionContext): string =>
  HeaderTenantResolver.read(context),
);
