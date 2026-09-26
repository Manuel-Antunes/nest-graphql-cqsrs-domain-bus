import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, buttonVariants } from '@nestposts/ui/components/ui/button';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarRange,
  Columns,
  Grid2x2,
  Grid3x3,
  List,
  Plus,
} from 'lucide-react';

import { AddEventDialog } from '@/calendar/components/dialogs/add-event-dialog';
import { DateNavigator } from '@/calendar/components/header/date-navigator';
import { TeamSelect } from '@/calendar/components/header/team-select';
import { TodayButton } from '@/calendar/components/header/today-button';
import { UserSelect } from '@/calendar/components/header/user-select';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import type { IEvent } from '@/calendar/interfaces';
import type { TCalendarView } from '@/calendar/types';
import { cn } from '@/lib/utils';

interface IProps {
  view: TCalendarView;
  events: IEvent[];
}

const VIEWS: ReadonlyArray<{
  view: TCalendarView;
  label: string;
  icon: LucideIcon;
}> = [
  { view: 'day', label: 'Ver por dia', icon: List },
  { view: 'week', label: 'Ver por semana', icon: Columns },
  { view: 'month', label: 'Ver por mês', icon: Grid2x2 },
  { view: 'year', label: 'Ver por ano', icon: Grid3x3 },
  { view: 'agenda', label: 'Ver agenda', icon: CalendarRange },
];

export function CalendarHeader({ view, events }: IProps) {
  const { basePath } = useCalendar();
  const searchParams = useSearchParams();
  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return (
    <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <TodayButton />
        <DateNavigator view={view} events={events} />
      </div>

      <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-between">
        <div className="flex w-full items-center gap-1.5">
          <div className="inline-flex">
            {VIEWS.map(({ view: target, label, icon: Icon }, index) => (
              <Link
                key={target}
                href={`${basePath}/${target}-view${query}`}
                aria-label={label}
                className={cn(
                  buttonVariants({
                    size: 'icon',
                    variant: view === target ? 'default' : 'outline',
                  }),
                  'rounded-none [&_svg]:size-5',
                  index === 0 && 'rounded-l-lg',
                  index > 0 && '-ml-px',
                  index === VIEWS.length - 1 && 'rounded-r-lg',
                )}
              >
                <Icon strokeWidth={1.8} />
              </Link>
            ))}
          </div>

          <TeamSelect />
          <UserSelect />
        </div>

        <AddEventDialog>
          <Button className="w-full sm:w-auto">
            <Plus />
            Adicionar Evento
          </Button>
        </AddEventDialog>
      </div>
    </div>
  );
}
