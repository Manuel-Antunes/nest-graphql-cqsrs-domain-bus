'use client';

import { useId } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@nestposts/ui/lib/utils';

export interface ITimeBlockDropData {
  type: 'time-block';
  date: Date;
  hour: number;
  minute: number;
}

interface DroppableTimeBlockProps {
  date: Date;
  hour: number;
  minute: number;
  children: React.ReactNode;
}

export function DroppableTimeBlock({
  date,
  hour,
  minute,
  children,
}: DroppableTimeBlockProps) {
  const id = useId();

  const { setNodeRef, isOver, active } = useDroppable({
    id,
    data: {
      type: 'time-block',
      date,
      hour,
      minute,
    } satisfies ITimeBlockDropData,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn('h-[24px]', isOver && active && 'bg-accent/50')}
    >
      {children}
    </div>
  );
}
