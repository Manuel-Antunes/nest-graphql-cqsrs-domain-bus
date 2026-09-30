/**
 * Shared helpers for the WebMCP tools: context resolution (which contact /
 * conversation the agent is acting on), the `clients` search document, and a
 * couple of small formatters. Keeping these here avoids duplication across the
 * individual tool modules.
 */
import { gql } from '@apollo/client/core';
import store from 'dashboard/store';

/** Build a WebMCP text tool result. */
export const ok = text => ({ content: [{ type: 'text', text }] });

/** Values of the `ClientKind` GraphQL enum. */
export const CLIENT_KINDS = ['JUDGMENT_CREDITOR', 'HEIR'];

const currentChat = () => store.getters.getSelectedChat || {};

/**
 * The chatwoot contact behind the open conversation (its sender), or an
 * explicit override. Returns a string id or null.
 */
export const resolveContactId = explicit => {
  if (explicit) return String(explicit);
  const chat = currentChat();
  const id = chat.meta && chat.meta.sender && chat.meta.sender.id;
  return id ? String(id) : null;
};

/** Id of the open conversation, or an explicit override. */
export const resolveConversationId = explicit => {
  if (explicit) return explicit;
  return currentChat().id || null;
};

/**
 * Shared client search. `Client` is a single FLAT type carrying its own
 * discriminator (`kind: ClientKind`), so every field is selected once — the
 * `... on Heir` inline fragment the old `Person` interface needed is gone.
 */
export const CLIENTS_QUERY = gql`
  query WebMcp_ClientsQuery($filter: ClientFilter!, $paging: OffsetPaging!) {
    clients(filter: $filter, paging: $paging) {
      nodes {
        id
        kind
        name
        cpf
      }
      totalCount
    }
  }
`;

/**
 * Build a `ClientFilter`. The old bespoke `people(filter: PersonsFilterInput)`
 * root had a `search` field that fanned out server-side; `clients` is the
 * generated nestjs-query CRUD root, so the free-text search is an explicit `or`
 * across the filterable columns. `kind` must be a ClientKind enum value;
 * anything else is ignored rather than sent to the server.
 */
export const buildClientsFilter = ({ search, kind } = {}) => {
  const and = [];
  if (search) {
    and.push({
      or: [
        { name: { iLike: `%${search}%` } },
        { cpf: { iLike: `%${search}%` } },
      ],
    });
  }
  if (CLIENT_KINDS.includes(kind)) {
    and.push({ kind: { eq: kind } });
  }
  return and.length ? { and } : {};
};

/** Normalize a client node into an agent-friendly summary. */
export const clientSummary = node => ({
  clientId: node.id,
  kind: node.kind,
  name: node.name,
  cpf: node.cpf,
});
