import { graphql } from '@/gql';
import { gqlQueryOptions } from '@/lib/graphql/gqlpc';

export const MeQuery = graphql(`
  query Me {
    me {
      ...IdentityPanel_user
    }
  }
`);

export const meOptions = () => gqlQueryOptions(MeQuery);
