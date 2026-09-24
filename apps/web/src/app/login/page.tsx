import { redirect } from 'next/navigation';

import { signInFor } from '@/lib/auth/views';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(signInFor(next ?? '/feed'));
}
