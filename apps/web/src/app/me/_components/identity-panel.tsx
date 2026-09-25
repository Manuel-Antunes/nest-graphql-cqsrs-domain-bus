'use client';

import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { buttonVariants } from '@nestposts/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nestposts/ui/components/ui/card';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ShieldCheckIcon, UserIcon } from 'lucide-react';

import { PostList } from '@/app/_components/post-list';
import { QueryErrorBoundary } from '@/app/_components/query-error-boundary';
import { useSession } from '@/app/_providers/session-provider';
import type { FragmentType } from '@/gql';
import { getFragmentData, graphql } from '@/gql';
import { cn } from '@/lib/utils';

import { meOptions } from '../query';

export const IdentityPanel_user = graphql(`
  fragment IdentityPanel_user on IUser {
    __typename
    id
    name
    email
    ... on Author {
      posts(first: 6) {
        ...PostList_connection
      }
    }
  }
`);

export function IdentityPanel() {
  const { session } = useSession();

  if (!session) {
    return (
      <Alert>
        <UserIcon />
        <AlertTitle>me exige token</AlertTitle>
        <AlertDescription>
          A autenticação não é proativa nesta API:{' '}
          <span className="font-mono">posts</span> é pública no mesmo POST em
          que <span className="font-mono">me</span> exige bearer.{' '}
          <Link href="/auth/sign-in?redirectTo=/me" className="underline">
            Entrar
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <QueryErrorBoundary title="me falhou">
      <Me />
    </QueryErrorBoundary>
  );
}

function Me() {
  const { data } = useSuspenseQuery(meOptions());
  return <IdentityCard user={data.me} />;
}

function IdentityCard({
  user,
}: {
  user: FragmentType<typeof IdentityPanel_user>;
}) {
  const me = getFragmentData(IdentityPanel_user, user);
  const isAuthor = me.__typename === 'Author';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{me.name}</CardTitle>
            <Badge
              variant={isAuthor ? 'default' : 'secondary'}
              className="font-mono text-[10px]"
            >
              {me.__typename}
            </Badge>
          </div>
          <CardDescription>
            {me.email} · <span className="font-mono text-[11px]">{me.id}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <ShieldCheckIcon className="size-4" aria-hidden />A credencial é do
            Better Auth; o que este perfil é — leitor ou autor — sai do
            <span className="font-mono"> __typename</span>, e não de um papel
            lido no cliente.
          </p>
        </CardContent>
      </Card>

      {isAuthor ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg tracking-tight">Meus posts</h2>
          <PostList
            connections={[me.posts]}
            emptyTitle="Este autor ainda não publicou"
            emptyDescription="Author.posts é resolvido em lote: N autores custam uma consulta."
          />
          <Link
            href="/posts/new"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Escrever um post
          </Link>
        </section>
      ) : null}
    </div>
  );
}
