import { graphql } from '../../../gql';

export const SupportIdentity = graphql(`
  query SupportIdentity {
    currentAgent {
      email
      user {
        __typename
        id
        email
      }
    }
    currentAccount {
      id
      name
    }
  }
`);

export const ChatwootIdentity = graphql(`
  query ChatwootIdentity {
    currentAgent {
      email
    }
    currentAccount {
      id
      name
    }
  }
`);

export const SupportContacts = graphql(`
  query SupportContacts($where: QueryContactsWhereWhereConditions) {
    contacts(first: 20, where: $where) {
      data {
        id
        name
      }
    }
  }
`);

export const CreateSupportContact = graphql(`
  mutation CreateSupportContact($input: CreateContactInput!) {
    createContact(input: $input) {
      contact {
        id
        name
      }
    }
  }
`);

export const LinkSupportContact = graphql(`
  mutation LinkSupportContact($input: LinkContactToClientInput!) {
    linkContactToClient(input: $input) {
      contact {
        id
      }
    }
  }
`);

export const TeamHours = graphql(`
  query TeamHours {
    teams {
      id
      name
      workingHours {
        nodes {
          dayOfWeek
          openHour
          closeHour
        }
      }
      supportTeam {
        name
      }
    }
  }
`);

export const SetTeamHours = graphql(`
  mutation SetTeamHours($input: SetTeamWorkingHoursInput!) {
    setTeamWorkingHours(input: $input) {
      team {
        name
      }
    }
  }
`);
