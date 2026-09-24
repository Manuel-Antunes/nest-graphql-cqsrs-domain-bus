'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button, buttonVariants } from '@nestposts/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nestposts/ui/components/ui/card';
import { Loader2Icon, PlayIcon, SquareIcon, WorkflowIcon } from 'lucide-react';

import { useSession } from '@/app/_providers/session-provider';
import { cn } from '@/lib/utils';

import type { SagaEvent } from '../_hooks/use-saga-run';
import { useSagaRun } from '../_hooks/use-saga-run';

const tones: Record<SagaEvent['tone'], string> = {
  neutral: 'border-sky-500/40 bg-sky-500/10',
  pending: 'border-amber-500/40 bg-amber-500/10',
  good: 'border-emerald-500/40 bg-emerald-500/10',
  bad: 'border-red-500/40 bg-red-500/10',
};

export function SagaRunner() {
  const params = useSearchParams();
  const watching = params.get('postId');
  const { session, isAuthor } = useSession();
  const { status, events, postId, elapsed, run, watch, stop } = useSagaRun();

  // biome-ignore lint/correctness/useExhaustiveDependencies: watch is recreated per render; re-running on it would restart the stream
  useEffect(() => {
    if (watching) void watch(watching);
  }, [watching]);

  const running = status === 'creating' || status === 'waiting';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WorkflowIcon className="size-4" aria-hidden />A travessia entre os
            dois serviços
          </CardTitle>
          <CardDescription>
            Cria um post e cronometra o caminho{' '}
            <span className="font-mono">
              PostPreCreated → SNS → SQS → tagging → SNS → SQS → PostCreated
            </span>
            . Nenhum dos dois serviços nomeia o outro: um publica, o outro
            escuta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session || !isAuthor ? (
            <Alert>
              <WorkflowIcon />
              <AlertTitle>Precisa de uma conta com a role author</AlertTitle>
              <AlertDescription>
                <Link
                  href="/auth/sign-in?redirectTo=/saga"
                  className="underline"
                >
                  Entrar como manuel@example.com
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void run()} disabled={running || !isAuthor}>
              {running ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PlayIcon />
              )}
              Rodar a saga
            </Button>
            {running ? (
              <Button variant="outline" onClick={stop}>
                <SquareIcon />
                Parar
              </Button>
            ) : null}
            {running ? (
              <Badge variant="outline" className="font-mono">
                {(elapsed / 1000).toFixed(0)}s
              </Badge>
            ) : null}
            {postId ? (
              <Link
                href={`/posts/${postId}`}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'font-mono text-xs',
                )}
              >
                {postId.slice(0, 8)}…
              </Link>
            ) : null}
          </div>

          {events.length > 0 ? (
            <ol className="space-y-2">
              {events.map((event, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: events is an append-only log, so the index is stable
                  key={index}
                  className={cn('rounded-md border p-3', tones[event.tone])}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-sm">{event.label}</span>
                    <span className="font-mono text-muted-foreground text-xs">
                      +{(event.at / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {event.detail}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}

          {status === 'closed' ? (
            <p className="text-emerald-600 text-sm dark:text-emerald-400">
              Saga fechada. O tempo acima inclui o cold start das funções — rode
              de novo com elas quentes para separar as duas coisas.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
