import { CalendarEventColor } from '@nestposts/events/domain/calendar-event/vo/calendar-event-color';
import { CalendarEventDescription } from '@nestposts/events/domain/calendar-event/vo/calendar-event-description';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventTitle } from '@nestposts/events/domain/calendar-event/vo/calendar-event-title';
import { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

const CreateMyEventInputSchema = z.object({
  title: CalendarEventTitle.field(),
  description: CalendarEventDescription.field().nullish(),
  startDate: z.date(),
  endDate: z.date(),
  color: CalendarEventColor.field().nullish(),
  participantIds: z.array(z.string()).nullish(),
  teamId: TeamId.field().nullish(),
});

const CreateEventInputSchema = CreateMyEventInputSchema.extend({
  responsibleId: UserId.field(),
});

const UpdateEventInputSchema = z.object({
  id: CalendarEventId.field(),
  title: CalendarEventTitle.field().nullish(),
  description: CalendarEventDescription.field().nullish(),
  startDate: z.date().nullish(),
  endDate: z.date().nullish(),
  color: CalendarEventColor.field().nullish(),
  responsibleId: UserId.field().nullish(),
  participantIds: z.array(z.string()).nullish(),
  teamId: TeamId.field().nullish(),
});

@InheritValidatedMetadata()
export class CreateMyEventInput extends ValidatedDto(
  CreateMyEventInputSchema,
) {}

@InheritValidatedMetadata()
export class CreateEventInput extends ValidatedDto(CreateEventInputSchema) {}

@InheritValidatedMetadata()
export class UpdateEventInput extends ValidatedDto(UpdateEventInputSchema) {}
