'use client';

import type { ReactElement } from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@nestposts/ui/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Text, Trash2, User, Users } from 'lucide-react';

import { EditEventDialog } from '@/calendar/components/dialogs/edit-event-dialog';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import { markEventDialogDismissed } from '@/calendar/dismiss-guard';
import { useEventMutations } from '@/calendar/hooks/use-event-mutations';
import type { IEvent } from '@/calendar/interfaces';

interface IProps {
  event: IEvent;
  children: React.ReactNode;
}

export function EventDetailsDialog({ event, children }: IProps) {
  const startDate = parseISO(event.startDate);
  const endDate = parseISO(event.endDate);

  const { deleteEvent } = useEventMutations();
  const { isAdmin } = useCalendar();

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) markEventDialogDismissed();
      }}
    >
      <DialogTrigger render={children as ReactElement} />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <User className="mt-1 size-4 shrink-0" />
            <div>
              <p className="font-medium text-sm">Responsável</p>
              <p className="text-muted-foreground text-sm">{event.user.name}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Calendar className="mt-1 size-4 shrink-0" />
            <div>
              <p className="font-medium text-sm">Data de início</p>
              <p className="text-muted-foreground text-sm">
                {format(startDate, "d 'de' MMM, yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="mt-1 size-4 shrink-0" />
            <div>
              <p className="font-medium text-sm">Data de término</p>
              <p className="text-muted-foreground text-sm">
                {format(endDate, "d 'de' MMM, yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </div>
          </div>

          {event.participants.length > 0 && (
            <div className="flex items-start gap-2">
              <Users className="mt-1 size-4 shrink-0" />
              <div>
                <p className="font-medium text-sm">Participantes</p>
                <p className="text-muted-foreground text-sm">
                  {event.participants.map((p) => p.name).join(', ')}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2">
            <Text className="mt-1 size-4 shrink-0" />
            <div>
              <p className="font-medium text-sm">Descrição</p>
              <p className="text-muted-foreground text-sm">
                {event.description || 'Sem descrição'}
              </p>
            </div>
          </div>
        </div>

        {isAdmin ? (
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteEvent.mutate({ id: event.id })}
              disabled={deleteEvent.isPending}
            >
              <Trash2 className="size-4" />
              Excluir
            </Button>
            <EditEventDialog event={event}>
              <Button type="button" variant="outline">
                Editar
              </Button>
            </EditEventDialog>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
