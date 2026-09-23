'use client';

import { useState } from 'react';
import { useQuery, useSuspenseQuery } from '@apollo/client/react';
import { Loader2Icon, NetworkIcon, PlayIcon } from 'lucide-react';

import { ErrorNotice } from '@/app/_components/error-notice';
import { useSession } from '@/app/_providers/session-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { EntitiesQuery, FederationSeedQuery } from '../query';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type Representation = { __typename: string; id: string };

const NO_SUCH_POST = '00000000-0000-4000-8000-000000000000';

export function EntitiesProbe() {
  const { session } = useSession();
  const seed = useSuspenseQuery(FederationSeedQuery, { errorPolicy: 'all' });
  const [representations, setRepresentations] = useState<
    Representation[] | null
  >(null);

  const entities = useQuery(EntitiesQuery, {
    variables: {
      representations: representations ?? [],
    },
    skip: !representations,
    fetchPolicy: 'network-only',
  });

  const nodes = (seed.data?.posts.edges ?? []).map((edge) => edge.node);

  const build = (): Representation[] => {
    const list: Representation[] = [];
    for (const post of nodes) {
      list.push({ __typename: 'Post', id: post.id });
      list.push({ __typename: 'Author', id: post.author.id });
      list.push({ __typename: 'User', id: post.author.id });
      for (const edge of post.tags.edges) {
        list.push({ __typename: 'Tag', id: edge.node.id });
      }
    }
    list.push({ __typename: 'Post', id: NO_SUCH_POST });
    return list;
  };

  const pending = build();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <NetworkIcon className="size-4" aria-hidden />
            _entities(representations:)
          </CardTitle>
          <CardDescription>
            {session
              ? 'Você está autenticado, mas esta query não usa a sessão — ela é pública.'
              : 'Sem sessão. É assim que o roteador da federação chama o subgraph.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {seed.error ? (
            <ErrorNotice
              title="Não foi possível ler os ids"
              error={seed.error}
            />
          ) : null}

          <Button
            onClick={() => setRepresentations(build())}
            disabled={nodes.length === 0 || entities.loading}
          >
            {entities.loading ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <PlayIcon />
            )}
            Resolver {pending.length} representações
          </Button>

          {representations ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium">Enviado</p>
                <pre
                  aria-label="Representações enviadas"
                  className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]"
                >
                  {JSON.stringify(representations, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">Recebido</p>
                {entities.error ? (
                  <ErrorNotice
                    title="_entities falhou"
                    error={entities.error}
                  />
                ) : (
                  <pre
                    aria-label="Entidades recebidas"
                    className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]"
                  >
                    {JSON.stringify(entities.data?._entities ?? [], null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ) : null}

          {entities.data ? (
            <ul
              aria-label="Entidades por posição"
              className="flex flex-wrap gap-2"
            >
              {entities.data._entities.map((entity, index) => (
                <li key={index}>
                  <Badge
                    variant={entity ? 'secondary' : 'outline'}
                    className="font-mono text-[10px]"
                  >
                    {index}: {entity?.__typename ?? 'null'}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
