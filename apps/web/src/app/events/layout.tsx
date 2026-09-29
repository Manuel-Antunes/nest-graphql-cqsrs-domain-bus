import { Suspense } from 'react';
import Link from 'next/link';
import {
  EVENT_RESOURCE,
  MANAGE_EVENTS,
} from '@nestposts/organizations/infrastructure/better-auth/access';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import { CalendarDaysIcon } from 'lucide-react';

import { QueryErrorBoundary } from '@/app/_components/query-error-boundary';
import { EVENTS_PATH } from '@/calendar/paths';
import { calendarOptions } from '@/calendar/queries';
import { WebAuth } from '@/lib/auth/server';
import { PrefetchQueries } from '@/lib/graphql/prefetch';

import { CalendarShell } from './_components/calendar-shell';

export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [identity, canManage] = await Promise.all([
    WebAuth.identity(),
    WebAuth.hasOrgPermission({ [EVENT_RESOURCE]: [...MANAGE_EVENTS] }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Eventos</h1>
        <p className="text-muted-foreground text-sm">
          O calendário do tenant ativo. Quem é owner ou admin da organização vê
          e gerencia todos os eventos; os demais veem os eventos de que são
          responsáveis ou participantes.
        </p>
      </div>

      {identity ? (
        <Suspense fallback={<Skeleton className="h-[640px] w-full" />}>
          <PrefetchQueries options={calendarOptions()}>
            <QueryErrorBoundary title="Não foi possível abrir o calendário">
              <CalendarShell canManage={canManage}>{children}</CalendarShell>
            </QueryErrorBoundary>
          </PrefetchQueries>
        </Suspense>
      ) : (
        <Alert>
          <CalendarDaysIcon />
          <AlertTitle>Entre para ver o calendário</AlertTitle>
          <AlertDescription>
            <Link
              href={`/auth/sign-in?redirectTo=${EVENTS_PATH}`}
              className="underline"
            >
              Ir para o login
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
