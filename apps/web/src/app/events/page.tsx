import { redirect } from 'next/navigation';

import { EVENTS_PATH } from '@/calendar/paths';

export default function EventsPage() {
  redirect(`${EVENTS_PATH}/month-view`);
}
