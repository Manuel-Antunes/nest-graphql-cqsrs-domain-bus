import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { HeadsetIcon } from 'lucide-react';

import { env } from '@/env.mjs';
import { WebAuth } from '@/lib/auth/server';
import { Chatwoot } from '@/lib/chatwoot';

import { ChatwootEmbed } from '../_components/chatwoot-embed';

type SupportPageProps = Readonly<{
  params: Promise<{ chatwootPath?: string[] }>;
}>;

export default async function SupportPage({ params }: SupportPageProps) {
  const [{ chatwootPath }, identity] = await Promise.all([
    params,
    WebAuth.identity(),
  ]);

  if (!identity) {
    return (
      <Alert>
        <HeadsetIcon />
        <AlertTitle>Sign in to open support</AlertTitle>
        <AlertDescription>
          <Link
            href={`/auth/sign-in?redirectTo=${Chatwoot.SUPPORT_PATH}`}
            className="underline"
          >
            Go to sign in
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="relative left-1/2 h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] -translate-x-1/2">
      <ChatwootEmbed
        url={env.CHATWOOT_URL}
        path={chatwootPath ? `/${chatwootPath.join('/')}` : ''}
      />
    </div>
  );
}
