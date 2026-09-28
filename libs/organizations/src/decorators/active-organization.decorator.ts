import type { PipeTransform, Type } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';

import { ActiveMemberPipe } from '../pipes/active-member.pipe';
import { ActiveOrganizationPipe } from '../pipes/active-organization.pipe';
import { ActiveOrganizationIdPipe } from '../pipes/active-organization-id.pipe';

type ExtraPipes = (Type<PipeTransform> | PipeTransform)[];

/**
 * The caller's active organization, in its three useful shapes.
 *
 * Each is `@Session()` with one pipe on it, and the pipe answers from `OrganizationService` — which
 * is request-scoped, so it already knows whose request this is and the session value the decorator
 * produces is only what triggers the pipe. Keeping `@Session()` is deliberate: it is what makes the
 * global guard's refusal come first, before any of this runs.
 */
export const ActiveOrganizationId = (
  ...pipes: ExtraPipes
): ParameterDecorator => Session(ActiveOrganizationIdPipe, ...pipes);

export const ActiveOrganization = (...pipes: ExtraPipes): ParameterDecorator =>
  Session(ActiveOrganizationPipe, ...pipes);

export const ActiveMember = (...pipes: ExtraPipes): ParameterDecorator =>
  Session(ActiveMemberPipe, ...pipes);
