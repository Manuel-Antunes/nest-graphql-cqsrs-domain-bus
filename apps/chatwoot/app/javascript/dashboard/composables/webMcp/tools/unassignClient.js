/**
 * WebMCP tool: `unassign_client` — unlinks the client currently linked to the
 * chatwoot contact of the open conversation (the inverse of `assign_client`),
 * mirroring the unlink flow in ClientInformationItem.vue. It first reads the
 * contact's linked client to get the id (and a friendly label) to unlink, so
 * the agent only needs to identify the contact.
 */
import { gql } from '@apollo/client/core';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import { useMcpTool } from '../useMcpTool';
import { ok, resolveContactId } from './shared';

const CONTACT_CLIENT_QUERY = gql`
  query WebMcp_ContactClientQuery($id: Mixed!) {
    contacts(where: { column: ID, operator: EQ, value: $id }, first: 1) {
      data {
        id
        client {
          id
          kind
          name
        }
      }
    }
  }
`;

const UNLINK_CLIENT = gql`
  mutation WebMcp_UnlinkClient($input: UnlinkContactFromClientInput!) {
    unlinkContactFromClient(input: $input) {
      contact {
        id
      }
    }
  }
`;

export function registerUnassignClientTool({ apolloClient }) {
  return useMcpTool({
    name: 'unassign_client',
    description:
      'Unlink the client currently linked to the chatwoot contact of the open conversation (or an explicit contactId). No-op if nothing is linked.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description:
            'Chatwoot contact id. Defaults to the contact of the open conversation.',
        },
      },
    },
    handler: async (args = {}) => {
      const contactId = resolveContactId(args.contactId);
      if (!contactId) {
        throw new Error(
          'No contact in context. Open a conversation or pass `contactId`.'
        );
      }

      const { data } = await apolloClient.query({
        query: CONTACT_CLIENT_QUERY,
        variables: { id: contactId },
        fetchPolicy: 'network-only',
      });
      const contact =
        data && data.contacts && data.contacts.data && data.contacts.data[0];
      const client = (contact && contact.client) || null;
      if (!client) {
        return ok(`Contact ${contactId} has no linked client.`);
      }

      await apolloClient.mutate({
        mutation: UNLINK_CLIENT,
        variables: { input: { contactId, clientId: client.id } },
      });

      emitter.emit(BUS_EVENTS.CONTACT_LINKED_PERSON_UPDATED, { contactId });

      const label = client.name
        ? `${client.name} (${client.kind})`
        : `client ${client.id}`;
      return ok(`Unlinked ${label} from contact ${contactId}.`);
    },
  });
}
