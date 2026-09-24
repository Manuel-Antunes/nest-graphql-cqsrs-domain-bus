import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ensureSessionServer } from '@better-auth-ui/core/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { Organization } from '@/components/auth/organization/organization';
import { WebAuth } from '@/lib/auth/server';
import { ORGANIZATION_VIEW_PATHS, signInFor } from '@/lib/auth/views';
import { getQueryClient } from '@/lib/query-client';

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!ORGANIZATION_VIEW_PATHS.has(path)) {
    notFound();
  }

  const queryClient = getQueryClient();
  const session = await ensureSessionServer(
    queryClient,
    await WebAuth.server(),
    { headers: await headers() },
  );
  if (!session) {
    redirect(signInFor(`/organization/${path}`));
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mx-auto w-full max-w-3xl">
        <Organization path={path} />
      </div>
    </HydrationBoundary>
  );
}
