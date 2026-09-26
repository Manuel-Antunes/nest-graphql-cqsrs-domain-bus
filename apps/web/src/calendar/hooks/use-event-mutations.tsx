'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { graphql } from '@/gql';
import { EVERY_GRAPH_QUERY, gqlMutationOptions } from '@/lib/graphql/gqlpc';

const CreateEventMutation = graphql(`
  mutation CreateEvent($input: CreateEventInput!) {
    createEvent(input: $input) {
      id
    }
  }
`);

const CreateMyEventMutation = graphql(`
  mutation CreateMyEvent($input: CreateMyEventInput!) {
    createMyEvent(input: $input) {
      id
    }
  }
`);

const UpdateEventMutation = graphql(`
  mutation UpdateEvent($input: UpdateEventInput!) {
    updateEvent(input: $input) {
      id
    }
  }
`);

const DeleteEventMutation = graphql(`
  mutation DeleteEvent($id: ID!) {
    deleteEvent(id: $id)
  }
`);

export function useEventMutations() {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: EVERY_GRAPH_QUERY });

  const createEvent = useMutation(
    gqlMutationOptions(CreateEventMutation, {
      onSuccess: () => {
        toast.success('Evento criado com sucesso!');
        return invalidate();
      },
      onError: () => toast.error('Erro ao criar evento.'),
    }),
  );

  const createMyEvent = useMutation(
    gqlMutationOptions(CreateMyEventMutation, {
      onSuccess: () => {
        toast.success('Evento criado com sucesso!');
        return invalidate();
      },
      onError: () => toast.error('Erro ao criar evento.'),
    }),
  );

  const updateEvent = useMutation(
    gqlMutationOptions(UpdateEventMutation, {
      onSuccess: invalidate,
      onError: () => toast.error('Erro ao atualizar evento.'),
    }),
  );

  const deleteEvent = useMutation(
    gqlMutationOptions(DeleteEventMutation, {
      onSuccess: () => {
        toast.success('Evento excluído.');
        return invalidate();
      },
      onError: () => toast.error('Erro ao excluir evento.'),
    }),
  );

  return { createEvent, createMyEvent, updateEvent, deleteEvent };
}
