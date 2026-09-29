import type { PipeTransform, Type } from '@nestjs/common';
import { CurrentIdentity } from '@nestposts/auth/decorators/current-identity.decorator';

import { ActiveMemberPipe } from '../pipes/active-member.pipe';
import { ActiveOrganizationPipe } from '../pipes/active-organization.pipe';
import { ActiveOrganizationIdPipe } from '../pipes/active-organization-id.pipe';

type ExtraPipes = (Type<PipeTransform> | PipeTransform)[];

/**
 * The caller's active organization, in its three useful shapes.
 *
 * Each is `@CurrentIdentity()` with one pipe on it, and the pipe answers from `OrganizationService` —
 * which is request-scoped, so it already knows whose request this is and the identity the decorator
 * produces is only what triggers the pipe.
 */
export const ActiveOrganizationId = (
  ...pipes: ExtraPipes
): ParameterDecorator => CurrentIdentity(ActiveOrganizationIdPipe, ...pipes);

export const ActiveOrganization = (...pipes: ExtraPipes): ParameterDecorator =>
  CurrentIdentity(ActiveOrganizationPipe, ...pipes);

export const ActiveMember = (...pipes: ExtraPipes): ParameterDecorator =>
  CurrentIdentity(ActiveMemberPipe, ...pipes);
