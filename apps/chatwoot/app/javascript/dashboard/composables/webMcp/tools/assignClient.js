/**
 * WebMCP tool: `assign_client` — links a client to the chatwoot contact of the
 * open conversation. Mirrors the link flow in ClientInformationItem.vue.
 */
import { gql } from '@apollo/client/core';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import { useMcpTool } from '../useMcpTool';
import {
  ok,
  resolveContactId,
  CLIENTS_QUERY,
  CLIENT_KINDS,
  buildClientsFilter,
  clientSummary,
} from './shared';

// One flat `Client` id space, so a single mutation links an exequente or a
// herdeiro alike — the caller never branches on a concrete type.
const LINK_CLIENT = gql`
  mutation AssignClient_LinkClient($input: LinkContactToClientInput!) {
    linkContactToClient(input: $input) {
      contact {
        id
      }
    }
  }
`;

export function registerAssignClientTool({ apolloClient }) {
  return useMcpTool({
    name: 'assign_client',
    description:
      'Link a client (JUDGMENT_CREDITOR or HEIR) to the chatwoot contact of the currently open conversation. Provide `query` (name or CPF) to search — optionally narrowed with `kind` — or `clientId` when the client is already known. A search that matches exactly one client links it; if several match, the candidates are returned so you can re-call with a specific clientId.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name or CPF to search for.',
        },
        kind: {
          type: 'string',
          enum: CLIENT_KINDS,
          description: 'Narrow the search to a single kind of client.',
        },
        clientId: {
          type: 'string',
          description:
            'Id of an already-known client. Skips the search entirely.',
        },
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

      let clientId = args.clientId ? String(args.clientId) : null;
      let label = clientId ? `client ${clientId}` : null;

      if (!clientId) {
        if (!args.query) {
          throw new Error('Pass `query` (name or CPF) or an explicit `clientId`.');
        }

        const { data } = await apolloClient.query({
          query: CLIENTS_QUERY,
          variables: {
            filter: buildClientsFilter({ search: args.query, kind: args.kind }),
            paging: { limit: 10, offset: 0 },
          },
          fetchPolicy: 'network-only',
        });

        const nodes = (data && data.clients && data.clients.nodes) || [];

        if (!nodes.length) {
          return ok(`No client matched "${args.query}".`);
        }
        if (nodes.length > 1) {
          return ok(
            JSON.stringify(
              {
                message:
                  'Several clients matched. Re-call assign_client with a specific clientId.',
                candidates: nodes.map(clientSummary),
              },
              null,
              2
            )
          );
        }

        const match = nodes[0];
        clientId = match.id;
        label = `${match.name} (${match.kind})`;
      }

      await apolloClient.mutate({
        mutation: LINK_CLIENT,
        variables: { input: { contactId, clientId } },
      });

      emitter.emit(BUS_EVENTS.CONTACT_LINKED_PERSON_UPDATED, { contactId });

      return ok(`Linked ${label} to contact ${contactId}.`);
    },
  });
}
