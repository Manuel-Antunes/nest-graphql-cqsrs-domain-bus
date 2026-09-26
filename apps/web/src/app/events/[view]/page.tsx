import { notFound } from 'next/navigation';

import { ClientContainer } from '@/calendar/components/client-container';
import type { TCalendarView } from '@/calendar/types';

const VIEWS: Record<string, TCalendarView> = {
  'day-view': 'day',
  'week-view': 'week',
  'month-view': 'month',
  'year-view': 'year',
  'agenda-view': 'agenda',
};

export default async function EventsViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const view = VIEWS[(await params).view];
  if (!view) {
    notFound();
  }
  return <ClientContainer view={view} />;
}
