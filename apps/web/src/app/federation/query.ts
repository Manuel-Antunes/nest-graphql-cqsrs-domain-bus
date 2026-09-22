import { graphql } from '@/gql';

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
