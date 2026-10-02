import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { BotIcon } from 'lucide-react';

import { WebAuth } from '@/lib/auth/server';

import { TheoChat } from './_components/theo-chat';

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
          with your own access token.
        </p>
      </div>
      {identity ? (
        <TheoChat />
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
