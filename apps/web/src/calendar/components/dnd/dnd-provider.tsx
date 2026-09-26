'use client';

import { useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { differenceInMilliseconds, parseISO } from 'date-fns';

import type { IEventDragData } from '@/calendar/components/dnd/draggable-event';
import type { IDayCellDropData } from '@/calendar/components/dnd/droppable-day-cell';
import type { ITimeBlockDropData } from '@/calendar/components/dnd/droppable-time-block';
import { useUpdateEvent } from '@/calendar/hooks/use-update-event';
import type { IEvent } from '@/calendar/interfaces';

interface DndProviderWrapperProps {
  children: React.ReactNode;
}

interface ActiveDragPreview {
  children: React.ReactNode;
  width: number;
  height: number;
}

type DropData = ITimeBlockDropData | IDayCellDropData;

export function DndProviderWrapper({ children }: DndProviderWrapperProps) {
  const { updateEvent } = useUpdateEvent();
  const [preview, setPreview] = useState<ActiveDragPreview | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as IEventDragData | undefined;
    if (!data) return;

    const rect = data.measure();
    setPreview({
      children: data.children,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setPreview(null);

    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as IEventDragData | undefined;
    const overData = over.data.current as DropData | undefined;
    if (!activeData || !overData) return;

    const droppedEvent: IEvent = activeData.event;

    const eventStartDate = parseISO(droppedEvent.startDate);
    const eventEndDate = parseISO(droppedEvent.endDate);
    const eventDurationMs = differenceInMilliseconds(
      eventEndDate,
      eventStartDate,
    );

    let newStartDate: Date;

    if (overData.type === 'time-block') {
      newStartDate = new Date(overData.date);
      newStartDate.setHours(overData.hour, overData.minute, 0, 0);
    } else {
      newStartDate = new Date(overData.cell.date);
      newStartDate.setHours(
        eventStartDate.getHours(),
        eventStartDate.getMinutes(),
        eventStartDate.getSeconds(),
        eventStartDate.getMilliseconds(),
      );
    }

    const newEndDate = new Date(newStartDate.getTime() + eventDurationMs);

    updateEvent({
      ...droppedEvent,
      startDate: newStartDate.toISOString(),
      endDate: newEndDate.toISOString(),
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}

      <DragOverlay dropAnimation={null}>
        {preview ? (
          <div style={{ width: preview.width, height: preview.height }}>
            {preview.children}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
