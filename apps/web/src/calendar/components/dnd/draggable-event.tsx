'use client';

import { useId } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@nestposts/ui/lib/utils';

import { useCalendar } from '@/calendar/contexts/calendar-context';
import type { IEvent } from '@/calendar/interfaces';

export const ItemTypes = {
  EVENT: 'event',
} as const;

export interface IEventDragData {
  type: typeof ItemTypes.EVENT;
  event: IEvent;
  children: React.ReactNode;
  measure: () => DOMRect | null;
}

interface DraggableEventProps {
  event: IEvent;
  children: React.ReactNode;
}

export function DraggableEvent({ event, children }: DraggableEventProps) {
  const id = useId();
  const { isAdmin } = useCalendar();

  const { attributes, listeners, setNodeRef, isDragging, node } = useDraggable({
    id,
    data: {
      type: ItemTypes.EVENT,
      event,
      children,
      measure: () => node.current?.getBoundingClientRect() ?? null,
    } satisfies IEventDragData,
    disabled: !isAdmin,
  });

  if (!isAdmin) {
    return <div>{children}</div>;
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(isDragging && 'opacity-40')}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}
