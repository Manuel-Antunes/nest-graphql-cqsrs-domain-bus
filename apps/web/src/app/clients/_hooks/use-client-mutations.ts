'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { graphql } from '@/gql';
import { EVERY_GRAPH_QUERY, gqlMutationOptions } from '@/lib/graphql/gqlpc';

const CreateClientMutation = graphql(`
  mutation CreateClient($input: CreateClientInput!) {
    createClient(input: $input) {
      id
    }
  }
`);

const UpdateClientMutation = graphql(`
  mutation UpdateClient($input: UpdateClientInput!) {
    updateClient(input: $input) {
      id
    }
  }
`);

const DeleteClientMutation = graphql(`
  mutation DeleteClient($id: ID!) {
    deleteClient(id: $id)
  }
`);

const LinkContactMutation = graphql(`
  mutation LinkContact($input: LinkContactToClientInput!) {
    linkContactToClient(input: $input) {
      contact {
        id
      }
    }
  }
`);

const UnlinkContactMutation = graphql(`
  mutation UnlinkContact($input: UnlinkContactFromClientInput!) {
    unlinkContactFromClient(input: $input) {
      contact {
        id
      }
    }
  }
`);

const CreateContactMutation = graphql(`
  mutation CreateContact($input: CreateContactInput!) {
    createContact(input: $input) {
      contact {
        id
      }
    }
  }
`);

const failed = (what: string) => (error: Error) =>
  toast.error(`${what}: ${error.message}`);

export function useClientMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: EVERY_GRAPH_QUERY });

  const createClient = useMutation(
    gqlMutationOptions(CreateClientMutation, {
      onSuccess: () => {
        toast.success('Client registered.');
        return refresh();
      },
      onError: failed('Could not register the client'),
    }),
  );

  const updateClient = useMutation(
    gqlMutationOptions(UpdateClientMutation, {
      onSuccess: () => {
        toast.success('Client updated.');
        return refresh();
      },
      onError: failed('Could not update the client'),
    }),
  );

  const deleteClient = useMutation(
    gqlMutationOptions(DeleteClientMutation, {
      onSuccess: () => {
        toast.success('Client removed.');
        return refresh();
      },
      onError: failed('Could not remove the client'),
    }),
  );

  const linkContact = useMutation(
    gqlMutationOptions(LinkContactMutation, {
      onSuccess: refresh,
      onError: failed('Could not link the contact'),
    }),
  );

  const unlinkContact = useMutation(
    gqlMutationOptions(UnlinkContactMutation, {
      onSuccess: refresh,
      onError: failed('Could not unlink the contact'),
    }),
  );

  const createContact = useMutation(
    gqlMutationOptions(CreateContactMutation, {
      onError: failed('Could not create the contact in Chatwoot'),
    }),
  );

  return {
    createClient,
    updateClient,
    deleteClient,
    linkContact,
    unlinkContact,
    createContact,
  };
}
