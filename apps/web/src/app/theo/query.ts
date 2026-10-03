import { graphql } from '@/gql';
import { gqlQueryOptions } from '@/lib/graphql/gqlpc';

import { THEO_AGENT_ID } from './_components/theo-agent-id';

export const TheoChatsQuery = graphql(`
  query TheoChats($agentId: String!) {
    chats(agentId: $agentId) {
      id
      title
      updatedAt
    }
  }
`);

export const TheoChatQuery = graphql(`
  query TheoChat($id: ID!) {
    chat(id: $id) {
      id
      messages {
        id
        role
        content
        toolCalls {
          id
          name
          arguments
        }
        toolCallId
      }
    }
  }
`);

export const theoChatsOptions = () =>
  gqlQueryOptions(TheoChatsQuery, { input: { agentId: THEO_AGENT_ID } });

export const theoChatOptions = (id: string) =>
  gqlQueryOptions(TheoChatQuery, { input: { id }, staleTime: 0 });
