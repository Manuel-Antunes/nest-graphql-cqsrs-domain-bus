import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ensureSessionServer } from '@better-auth-ui/core/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { Admin } from '@/components/auth/admin/admin';
import { WebAuth } from '@/lib/auth/server';
import { signInFor } from '@/lib/auth/views';
import { getQueryClient } from '@/lib/query-client';

export default async function AdminUsersPage() {
  const queryClient = getQueryClient();
  const session = await ensureSessionServer(
    queryClient,
    await WebAuth.server(),
    { headers: await headers() },
  );
  if (!session) {
    redirect(signInFor('/admin/users'));
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Admin view="users" />
    </HydrationBoundary>
  );
}
