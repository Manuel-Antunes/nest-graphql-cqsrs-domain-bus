import { graphql } from '../../../gql';

export const RecordChat = graphql(`
  mutation RecordChat($input: RecordChatInput!) {
    recordChat(input: $input) {
      id
      agentId
      title
    }
  }
`);

export const ChatById = graphql(`
  query ChatById($id: ID!) {
    chat(id: $id) {
      id
      title
    }
  }
`);
