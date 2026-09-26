'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { parseISO } from 'date-fns';
import { useForm } from 'react-hook-form';

import { EventFormDialog } from '@/calendar/components/dialogs/event-form-dialog';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import { useEventMutations } from '@/calendar/hooks/use-event-mutations';
import type { IEvent } from '@/calendar/interfaces';
import type { TEventFormData } from '@/calendar/schemas';
import { eventDtoSchema } from '@/calendar/schemas';

interface IProps {
  children: React.ReactNode;
  event: IEvent;
}

export function EditEventDialog({ children, event }: IProps) {
  const { isAdmin } = useCalendar();
  const { updateEvent } = useEventMutations();

  const form = useForm<TEventFormData>({
    resolver: zodResolver(eventDtoSchema),
    defaultValues: {
      user: event.user.id,
      participantIds: event.participants?.map((p) => p.id) ?? [],
      teamId: event.teamId ?? '',
      title: event.title,
      description: event.description,
      startDate: parseISO(event.startDate),
      startTime: {
        hour: parseISO(event.startDate).getHours(),
        minute: parseISO(event.startDate).getMinutes(),
      },
      endDate: parseISO(event.endDate),
      endTime: {
        hour: parseISO(event.endDate).getHours(),
        minute: parseISO(event.endDate).getMinutes(),
      },
      color: event.color,
    },
  });

  const onSubmit = async (values: TEventFormData) => {
    const startDateTime = new Date(values.startDate);
    startDateTime.setHours(values.startTime.hour, values.startTime.minute);

    const endDateTime = new Date(values.endDate);
    endDateTime.setHours(values.endTime.hour, values.endTime.minute);

    await updateEvent.mutateAsync({
      input: {
        id: event.id,
        title: values.title,
        color: values.color,
        description: values.description,
        startDate: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        responsibleId: values.user,
        participantIds: values.participantIds,
        teamId: values.teamId ? values.teamId : null,
      },
    });
  };

  return (
    <EventFormDialog
      form={form}
      onSubmit={onSubmit}
      title="Editar Evento"
      description={
        isAdmin
          ? 'Atualize o evento, seu responsável e participantes.'
          : 'Atualize os detalhes do seu evento.'
      }
      submitLabel="Salvar alterações"
      isSubmitting={updateEvent.isPending}
    >
      {children}
    </EventFormDialog>
  );
}
