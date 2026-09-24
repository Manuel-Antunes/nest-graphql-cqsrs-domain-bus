import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ensureSessionServer } from '@better-auth-ui/core/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { Settings } from '@/components/auth/settings/settings';
import { WebAuth } from '@/lib/auth/server';
import { SETTINGS_VIEW_PATHS, signInFor } from '@/lib/auth/views';
import { getQueryClient } from '@/lib/query-client';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!SETTINGS_VIEW_PATHS.has(path)) {
    notFound();
  }

  const queryClient = getQueryClient();
  const session = await ensureSessionServer(
    queryClient,
    await WebAuth.server(),
    { headers: await headers() },
  );
  if (!session) {
    redirect(signInFor(`/settings/${path}`));
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mx-auto w-full max-w-3xl">
        <Settings path={path} />
      </div>
    </HydrationBoundary>
  );
}
