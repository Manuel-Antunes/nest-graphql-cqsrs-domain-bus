import { notFound } from 'next/navigation';

import { Auth } from '@/components/auth/auth';
import { AUTH_VIEW_PATHS } from '@/lib/auth/views';

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!AUTH_VIEW_PATHS.has(path)) {
    notFound();
  }

  return (
    <div className="flex justify-center py-6">
      <Auth path={path} />
    </div>
  );
}
