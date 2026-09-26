import { graphql } from '../../../gql';

export const WhoAmI = graphql(`
  query WhoAmI {
    me {
      __typename
      email
    }
  }
`);

export const FederatedMe = graphql(`
  query FederatedMe {
    me {
      __typename
      email
      unreadNotificationCount
      notifications(first: 1) {
        id
      }
    }
    unreadNotificationCount
  }
`);
