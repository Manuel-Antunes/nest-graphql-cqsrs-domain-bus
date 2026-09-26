import type { TEventColor } from '@/calendar/types';

export interface IUser {
  id: string;
  name: string;
  image: string | null;
}

export interface ITeam {
  id: string;
  name: string;
}

export interface IEvent {
  id: string;
  startDate: string;
  endDate: string;
  title: string;
  color: TEventColor;
  description: string;
  user: IUser;
  participants: IUser[];
  teamId: string | null;
}

export interface ICalendarCell {
  day: number;
  currentMonth: boolean;
  date: Date;
}
