import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { CalendarEventRepository } from '../domain/calendar-event/calendar-event.repository';
import { CalendarEventEntitySchema } from './persistence/entities/calendar-event-orm.entity';
import { MikroOrmCalendarEventRepository } from './persistence/repositories/mikro-orm-calendar-event.repository';

export const eventsEntities = [CalendarEventEntitySchema];

@Module({
  imports: [DatabaseModule.forFeature(eventsEntities)],
  providers: [
    {
      provide: CalendarEventRepository,
      useClass: MikroOrmCalendarEventRepository,
    },
  ],
  exports: [CalendarEventRepository],
})
export class EventsInfrastructureModule {}
