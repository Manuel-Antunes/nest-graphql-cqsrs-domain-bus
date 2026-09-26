import { endOfWeek, endOfYear, startOfWeek, startOfYear } from 'date-fns';

import type { IEvent, ITeam, IUser } from '@/calendar/interfaces';
import type { TEventColor } from '@/calendar/types';
import { graphql } from '@/gql';
import { gqlQueryOptions } from '@/lib/graphql/gqlpc';

export const CalendarViewerQuery = graphql(`
  query CalendarViewer {
    me {
      id
    }
  }
`);

export const CalendarMembersQuery = graphql(`
  query CalendarMembers {
    members {
      id
      name
    }
  }
`);

export const CalendarTeamsQuery = graphql(`
  query CalendarTeams {
    teams {
      id
      name
    }
  }
`);

export const CalendarEventsQuery = graphql(`
  query CalendarEvents($range: EventRangeInput, $teamId: ID, $first: Int) {
    events(range: $range, teamId: $teamId, first: $first) {
      edges {
        node {
          id
          title
          description
          startDate
          endDate
          color
          responsible {
            id
            name
          }
          participants {
            id
            name
          }
          team {
            id
          }
        }
      }
    }
  }
`);

export const CALENDAR_PAGE_SIZE = 500;

interface Person {
  id: string;
  name: string;
}

interface EventNode {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  color: string;
  responsible: Person;
  participants: Person[];
  team?: { id: string } | null;
}

export const calendarViewerOptions = () => gqlQueryOptions(CalendarViewerQuery);

export const calendarMembersOptions = () =>
  gqlQueryOptions(CalendarMembersQuery);

export const calendarTeamsOptions = () => gqlQueryOptions(CalendarTeamsQuery);

export const calendarOptions = () =>
  [
    calendarViewerOptions(),
    calendarMembersOptions(),
    calendarTeamsOptions(),
  ] as const;

export const calendarEventsOptions = (year: Date, teamId: string | null) =>
  gqlQueryOptions(CalendarEventsQuery, {
    input: {
      range: {
        from: startOfWeek(startOfYear(year)).toISOString(),
        to: endOfWeek(endOfYear(year)).toISOString(),
      },
      teamId,
      first: CALENDAR_PAGE_SIZE,
    },
  });

export function userOf(person: Person): IUser {
  return { id: person.id, name: person.name, image: null };
}

export function teamOf(team: Person): ITeam {
  return { id: team.id, name: team.name };
}

export function eventOf(node: EventNode): IEvent {
  return {
    id: node.id,
    title: node.title,
    description: node.description ?? '',
    startDate: node.startDate,
    endDate: node.endDate,
    color: node.color as TEventColor,
    user: userOf(node.responsible),
    participants: node.participants.map(userOf),
    teamId: node.team?.id ?? null,
  };
}
