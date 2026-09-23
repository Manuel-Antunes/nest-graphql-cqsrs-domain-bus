import { relayStylePagination } from '@apollo/client/utilities';
import { InMemoryCache } from '@apollo/client-integration-nextjs';

import generatedIntrospection from '@/gql/possible-types';

export function createCache(): InMemoryCache {
  return new InMemoryCache({
    possibleTypes: generatedIntrospection.possibleTypes,
    typePolicies: {
      Query: {
        fields: {
          posts: relayStylePagination(['first']),
        },
      },
      Post: { keyFields: ['id'] },
      Tag: { keyFields: ['id'] },
      Author: { keyFields: ['id'] },
      User: { keyFields: ['id'] },
    },
  });
}
