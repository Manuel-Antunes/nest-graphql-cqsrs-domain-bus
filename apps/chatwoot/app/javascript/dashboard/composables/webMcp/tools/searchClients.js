/**
 * WebMCP tool: `search_clients` — read-only search over the platform's clients
 * (an exequente / JUDGMENT_CREDITOR or a herdeiro / HEIR) by name or CPF, with
 * an optional kind filter. Lets the agent find a clientId to pass to
 * `assign_client`.
 */
import { useMcpTool } from '../useMcpTool';
import { ok, CLIENTS_QUERY, CLIENT_KINDS, buildClientsFilter, clientSummary } from './shared';

export function registerSearchClientsTool({ apolloClient }) {
  return useMcpTool({
    name: 'search_clients',
    description:
      'Search clients (JUDGMENT_CREDITOR or HEIR) by name or CPF, optionally narrowed to one kind. Returns candidates with clientId + kind to use with assign_client. Read-only.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Name or CPF to search for. Empty returns the first results.',
        },
        kind: {
          type: 'string',
          enum: CLIENT_KINDS,
          description:
            'Restrict the search to a single kind of client. Omit to search both.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 10, max 50).',
        },
      },
    },
    handler: async (args = {}) => {
      const query = args.query || '';
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);

      const { data } = await apolloClient.query({
        query: CLIENTS_QUERY,
        variables: {
          filter: buildClientsFilter({ search: query, kind: args.kind }),
          paging: { limit, offset: 0 },
        },
        fetchPolicy: 'network-only',
      });

      const clients = (data && data.clients) || {};
      const nodes = clients.nodes || [];
      const totalCount = clients.totalCount ?? nodes.length;

      return ok(
        JSON.stringify(
          { totalCount, results: nodes.map(clientSummary) },
          null,
          2
        )
      );
    },
  });
}
