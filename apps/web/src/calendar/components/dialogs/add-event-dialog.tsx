'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { addMinutes } from 'date-fns';
import { useForm } from 'react-hook-form';

import { EventFormDialog } from '@/calendar/components/dialogs/event-form-dialog';
import { ALL_TEAMS, useCalendar } from '@/calendar/contexts/calendar-context';
import { useEventMutations } from '@/calendar/hooks/use-event-mutations';
import type { TEventFormData } from '@/calendar/schemas';
import { eventDtoSchema } from '@/calendar/schemas';

interface IProps {
  children: React.ReactNode;
  startDate?: Date;
  startTime?: { hour: number; minute: number };
}

export function AddEventDialog({ children, startDate, startTime }: IProps) {
  const { currentUserId, isAdmin, selectedTeamId } = useCalendar();
  const { createEvent, createMyEvent } = useEventMutations();

  const scopedTeamId = selectedTeamId === ALL_TEAMS ? '' : selectedTeamId;

  const form = useForm<TEventFormData>({
    resolver: zodResolver(eventDtoSchema),
    defaultValues: {
      title: '',
      description: '',
      user: currentUserId,
      color: 'blue',
      participantIds: [],
      teamId: scopedTeamId,
      startDate: typeof startDate !== 'undefined' ? startDate : undefined,
      startTime: typeof startTime !== 'undefined' ? startTime : undefined,
    },
  });

  const isSubmitting = createEvent.isPending || createMyEvent.isPending;

  const onSubmit = async (values: TEventFormData) => {
    const start = new Date(values.startDate);
    start.setHours(values.startTime.hour, values.startTime.minute, 0, 0);
    const end = new Date(values.endDate);
    end.setHours(values.endTime.hour, values.endTime.minute, 0, 0);

    const base = {
      title: values.title,
      description: values.description,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      color: values.color,
      participantIds: values.participantIds,
      teamId: values.teamId ? values.teamId : null,
    };

    if (isAdmin) {
      await createEvent.mutateAsync({
        input: { ...base, responsibleId: values.user },
      });
    } else {
      await createMyEvent.mutateAsync({ input: base });
    }

    form.reset();
  };

  const { reset, setValue, watch } = form;
  const presetDay = startDate?.getTime();
  const presetHour = startTime?.hour;
  const presetMinute = startTime?.minute;

  useEffect(() => {
    reset({
      user: currentUserId,
      color: 'blue',
      participantIds: [],
      teamId: scopedTeamId,
      startDate: presetDay === undefined ? undefined : new Date(presetDay),
      startTime:
        presetHour === undefined || presetMinute === undefined
          ? undefined
          : { hour: presetHour, minute: presetMinute },
    });
  }, [reset, presetDay, presetHour, presetMinute, currentUserId, scopedTeamId]);

  const startDay = watch('startDate')?.getTime();
  const startHour = watch('startTime')?.hour;
  const startMinute = watch('startTime')?.minute;

  useEffect(() => {
    if (
      startDay === undefined ||
      startHour === undefined ||
      startMinute === undefined
    ) {
      return;
    }
    const start = new Date(startDay);
    start.setHours(startHour, startMinute, 0, 0);

    const end = addMinutes(start, 30);
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    setValue('endDate', endDay, { shouldValidate: true });
    setValue(
      'endTime',
      { hour: end.getHours(), minute: end.getMinutes() },
      { shouldValidate: true },
    );
  }, [setValue, startDay, startHour, startMinute]);

  return (
    <EventFormDialog
      form={form}
      onSubmit={onSubmit}
      title="Adicionar Evento"
      description={
        isAdmin
          ? 'Escolha o responsável e os participantes deste evento.'
          : 'Você será definido como o responsável por este evento.'
      }
      submitLabel="Criar Evento"
      isSubmitting={isSubmitting}
    >
      {children}
    </EventFormDialog>
  );
}
