import { graphql } from '../../../gql';

export const RegisterClient = graphql(`
  mutation RegisterClient($input: CreateClientInput!) {
    createClient(input: $input) {
      id
      name
      cpf
    }
  }
`);

export const ClientsWithContacts = graphql(`
  query ClientsWithContacts {
    clients(first: 200) {
      edges {
        node {
          id
          name
          contacts {
            nodes {
              id
              name
              dashboardPath
              client {
                id
              }
            }
          }
        }
      }
    }
  }
`);
