import { Suspense } from 'react';
import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import { BotIcon } from 'lucide-react';

import { QueryErrorBoundary } from '@/app/_components/query-error-boundary';
import { WebAuth } from '@/lib/auth/server';
import { PrefetchQuery } from '@/lib/graphql/prefetch';

import { TheoChat } from './_components/theo-chat';
import { TheoThreadList } from './_components/theo-thread-list';
import { theoChatsOptions } from './query';

const THEO_PATH = '/theo';

export default async function TheoPage() {
  const identity = await WebAuth.identity();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Theo</h1>
        <p className="text-muted-foreground text-sm">
          The platform's assistant, an AG-UI agent on Amazon Bedrock AgentCore
          Runtime. What concerns posts it hands to the posts agent, over A2A,
          with your own access token. Theo keeps your conversations in its
          AgentCore Memory, in the organization you are in, to pick up where you
          left off.
        </p>
      </div>
      {identity ? (
        <TheoChat
          threads={
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <PrefetchQuery options={theoChatsOptions()}>
                <QueryErrorBoundary title="Your conversations with Theo could not be listed">
                  <TheoThreadList />
                </QueryErrorBoundary>
              </PrefetchQuery>
            </Suspense>
          }
        />
      ) : (
        <Alert>
          <BotIcon />
          <AlertTitle>Sign in to talk to Theo</AlertTitle>
          <AlertDescription>
            <Link
              href={`/auth/sign-in?redirectTo=${THEO_PATH}`}
              className="underline"
            >
              Go to sign in
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
