import {
  ApolloClient,
  createHttpLink,
  InMemoryCache,
} from '@apollo/client/core';
import { getBaseUrl } from '../../lib/utils/getBaseUrl';

const httpLink = createHttpLink({
  uri: `${getBaseUrl()}/graphql`,
  credentials: 'include',
});

export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache({
    possibleTypes: {
      Person: ['JudgmentCreditor', 'Heir'],
    },
  }),
});
