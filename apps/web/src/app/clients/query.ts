import { graphql } from '@/gql';
import type { ClientFilterInput } from '@/gql/graphql';
import { gqlQueryOptions } from '@/lib/graphql/gqlpc';

export const ClientsQuery = graphql(`
  query Clients($filter: ClientFilterInput, $first: Int) {
    clients(filter: $filter, first: $first) {
      totalCount
      edges {
        node {
          id
          name
          kind
          cpf
          rg
          status
          isActive
          birthDate
          deathDate
          isDeceased
          occupation
          unionMembership
          notes
          hasPendingLitigation
          hasRenounced
          isQualified
          documentationComplete
          address {
            street
            number
            complement
            city
            state
            zipCode
          }
          createdBy {
            id
            name
          }
          createdAt
          contacts {
            nodes {
              id
              name
              email
              phoneNumber
              dashboardPath
            }
          }
        }
      }
    }
  }
`);

export const ClientContactSearchQuery = graphql(`
  query ClientContactSearch($where: QueryContactsWhereWhereConditions) {
    contacts(first: 8, where: $where) {
      data {
        id
        name
        email
        phoneNumber
        dashboardPath
        client {
          id
          name
        }
      }
    }
  }
`);

export const CLIENTS_PAGE_SIZE = 200;

export const clientsOptions = (filter: ClientFilterInput = {}) =>
  gqlQueryOptions(ClientsQuery, {
    input: { filter, first: CLIENTS_PAGE_SIZE },
  });

export const contactSearchOptions = (term: string) =>
  gqlQueryOptions(ClientContactSearchQuery, {
    input: {
      where: {
        OR: [
          { column: 'NAME', operator: 'CONTAINS', value: term },
          { column: 'EMAIL', operator: 'CONTAINS', value: term },
        ],
      },
    },
  });
