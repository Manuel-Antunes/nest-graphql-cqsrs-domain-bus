'use client';

import type { Dispatch, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  keepPreviousData,
  useQuery,
  useSuspenseQueries,
} from '@tanstack/react-query';
import { createParser, parseAsString, useQueryState } from 'nuqs';

import { toDateParam } from '@/calendar/helpers';
import type { IEvent, ITeam, IUser } from '@/calendar/interfaces';
import {
  calendarEventsOptions,
  calendarOptions,
  eventOf,
  teamOf,
  userOf,
} from '@/calendar/queries';
import type {
  TBadgeVariant,
  TVisibleHours,
  TWorkingHours,
} from '@/calendar/types';

export const ALL_TEAMS = 'all';

export const ALL_USERS = 'all';

interface ICalendarContext {
  basePath: string;
  currentUserId: string;
  isAdmin: boolean;
  selectedDate: Date;
  setSelectedDate: (date: Date | undefined) => void;
  selectedUserId: IUser['id'];
  setSelectedUserId: (userId: IUser['id']) => void;
  teams: ITeam[];
  selectedTeamId: string;
  setSelectedTeamId: (teamId: string) => void;
  badgeVariant: TBadgeVariant;
  setBadgeVariant: (variant: TBadgeVariant) => void;
  users: IUser[];
  workingHours: TWorkingHours;
  visibleHours: TVisibleHours;
  setVisibleHours: Dispatch<SetStateAction<TVisibleHours>>;
  events: IEvent[];
  setLocalEvents: Dispatch<SetStateAction<IEvent[]>>;
}

const CalendarContext = createContext<ICalendarContext | null>(null);

const WORKING_HOURS: TWorkingHours = {
  0: { from: 0, to: 0 },
  1: { from: 8, to: 17 },
  2: { from: 8, to: 17 },
  3: { from: 8, to: 17 },
  4: { from: 8, to: 17 },
  5: { from: 8, to: 17 },
  6: { from: 8, to: 12 },
};

const VISIBLE_HOURS: TVisibleHours = { from: 7, to: 18 };

const parseAsLocalDate = createParser({
  parse(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  },
  serialize: toDateParam,
});

export function CalendarProvider({
  children,
  basePath,
  canManage,
}: {
  children: React.ReactNode;
  basePath: string;
  canManage: boolean;
}) {
  const [viewer, members, organizationTeams] = useSuspenseQueries({
    queries: calendarOptions(),
  });
  const users = useMemo(() => members.data.members.map(userOf), [members.data]);
  const teams = useMemo(
    () => organizationTeams.data.teams.map(teamOf),
    [organizationTeams.data],
  );

  const [badgeVariant, setBadgeVariant] = useState<TBadgeVariant>('colored');
  const [visibleHours, setVisibleHours] =
    useState<TVisibleHours>(VISIBLE_HOURS);

  const [selectedDate, setDateParam] = useQueryState(
    'date',
    parseAsLocalDate.withDefault(new Date()),
  );
  const [selectedUserId, setUserParam] = useQueryState(
    'user',
    parseAsString.withDefault(ALL_USERS),
  );
  const [selectedTeamId, setTeamParam] = useQueryState(
    'team',
    parseAsString.withDefault(ALL_TEAMS),
  );

  const eventsQuery = useQuery({
    ...calendarEventsOptions(
      selectedDate,
      selectedTeamId === ALL_TEAMS ? null : selectedTeamId,
    ),
    placeholderData: keepPreviousData,
  });

  const [localEvents, setLocalEvents] = useState<IEvent[]>([]);
  useEffect(() => {
    setLocalEvents(
      eventsQuery.data?.events.edges.map((edge) => eventOf(edge.node)) ?? [],
    );
  }, [eventsQuery.data]);

  return (
    <CalendarContext.Provider
      value={{
        basePath,
        currentUserId: viewer.data.me.id,
        isAdmin: canManage,
        selectedDate,
        setSelectedDate: (date) => {
          if (date) void setDateParam(date);
        },
        selectedUserId,
        setSelectedUserId: (userId) => void setUserParam(userId),
        teams,
        selectedTeamId,
        setSelectedTeamId: (teamId) => void setTeamParam(teamId),
        badgeVariant,
        setBadgeVariant,
        users,
        visibleHours,
        setVisibleHours,
        workingHours: WORKING_HOURS,
        events: localEvents,
        setLocalEvents,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar(): ICalendarContext {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider.');
  }
  return context;
}
