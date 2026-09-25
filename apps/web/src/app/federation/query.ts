import { graphql } from '@/gql';
import type { EntitiesQueryVariables } from '@/gql/graphql';
import {
  gqlQueryOptions,
  postsSubgraphQueryOptions,
} from '@/lib/graphql/gqlpc';

export const FederationSeedQuery = graphql(`
  query FederationSeed {
    posts(first: 3) {
      edges {
        node {
          id
          title
          author {
            id
            name
          }
          tags(first: 2) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`);

export const EntitiesQuery = graphql(`
  query Entities($representations: [_Any!]!) {
    _entities(representations: $representations) {
      __typename
      ... on Post {
        id
        title
        version
      }
      ... on Tag {
        id
        name
      }
      ... on Author {
        id
        name
        email
      }
      ... on User {
        id
        name
        email
      }
    }
  }
`);

export const federationSeedOptions = () => gqlQueryOptions(FederationSeedQuery);

export const entitiesOptions = (
  representations: EntitiesQueryVariables['representations'],
) =>
  postsSubgraphQueryOptions(EntitiesQuery, {
    input: { representations },
    staleTime: 0,
  });
