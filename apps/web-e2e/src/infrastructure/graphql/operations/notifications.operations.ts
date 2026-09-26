import { graphql } from '../../../gql';

export const MyNotifications = graphql(`
  query MyNotifications {
    notifications {
      id
      type
      data
      read
    }
  }
`);

export const ReadNotification = graphql(`
  mutation ReadNotification($id: ID!) {
    markNotificationAsRead(id: $id) {
      id
      read
      readAt
    }
  }
`);
