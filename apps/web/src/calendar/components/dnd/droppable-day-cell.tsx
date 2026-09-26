'use client';

import { useId } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@nestposts/ui/lib/utils';

import type { ICalendarCell } from '@/calendar/interfaces';

export interface IDayCellDropData {
  type: 'day-cell';
  cell: ICalendarCell;
}

interface DroppableDayCellProps {
  cell: ICalendarCell;
  children: React.ReactNode;
}

export function DroppableDayCell({ cell, children }: DroppableDayCellProps) {
  const id = useId();

  const { setNodeRef, isOver, active } = useDroppable({
    id,
    data: { type: 'day-cell', cell } satisfies IDayCellDropData,
  });

  return (
    <div ref={setNodeRef} className={cn(isOver && active && 'bg-accent/50')}>
      {children}
    </div>
  );
}
