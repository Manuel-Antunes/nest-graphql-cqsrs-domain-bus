'use client';

import type { ReactElement } from 'react';
import { cloneElement, isValidElement, useId } from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nestposts/ui/components/ui/dialog';
import { Form } from '@nestposts/ui/components/ui/form';
import { useDisclosure } from '@nestposts/ui/hooks/use-disclosure';
import type { UseFormReturn } from 'react-hook-form';

import { EventFormFields } from '@/calendar/components/dialogs/event-form-fields';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import {
  markEventDialogDismissed,
  wasEventDialogJustDismissed,
} from '@/calendar/dismiss-guard';
import type { TEventFormData } from '@/calendar/schemas';

interface IProps {
  children: React.ReactNode;
  form: UseFormReturn<TEventFormData>;
  onSubmit: (values: TEventFormData) => Promise<void> | void;
  title: string;
  description: string;
  submitLabel: string;
  isSubmitting?: boolean;
}

export function EventFormDialog({
  children,
  form,
  onSubmit,
  title,
  description,
  submitLabel,
  isSubmitting,
}: IProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { users, teams, isAdmin } = useCalendar();
  const formId = useId();

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    onClose();
  });

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-haspopup': 'dialog',
        'data-state': isOpen ? 'open' : 'closed',
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          (
            children.props as { onClick?: (e: React.MouseEvent) => void }
          ).onClick?.(event);
          if (event.defaultPrevented) return;
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (wasEventDialogJustDismissed()) return;
          onOpen();
        },
      })
    : children;

  return (
    <>
      {trigger}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
            markEventDialogDismissed();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2"
            >
              <EventFormFields users={users} teams={teams} isAdmin={isAdmin} />
            </form>
          </Form>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancelar
            </DialogClose>

            <Button form={formId} type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
