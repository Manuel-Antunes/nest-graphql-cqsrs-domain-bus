'use client';

import { Calendar } from '@nestposts/ui/components/ui/calendar';
import type { PropsBase, PropsSingle } from 'react-day-picker';

type SingleCalendarProps = PropsBase & PropsSingle;

function SingleCalendar({
  selected,
  defaultMonth,
  ...props
}: SingleCalendarProps) {
  return (
    <Calendar
      {...props}
      mode="single"
      selected={selected}
      defaultMonth={defaultMonth ?? selected}
    />
  );
}

export type { SingleCalendarProps };
export { SingleCalendar };
