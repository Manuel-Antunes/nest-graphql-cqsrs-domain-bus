'use client';

import { useState } from 'react';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nestposts/ui/components/ui/card';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Loader2Icon, NetworkIcon, PlayIcon } from 'lucide-react';

import { ErrorNotice } from '@/app/_components/error-notice';
import { useSession } from '@/app/_providers/session-provider';

import { entitiesOptions, federationSeedOptions } from '../query';

type Representation = { __typename: string; id: string };

const NO_SUCH_POST = '00000000-0000-4000-8000-000000000000';

export function EntitiesProbe() {
  const { session } = useSession();
  const seed = useSuspenseQuery(federationSeedOptions());
  const [representations, setRepresentations] = useState<
    Representation[] | null
  >(null);

  const entities = useQuery({
    ...entitiesOptions(representations ?? []),
    enabled: representations !== null,
  });

  const nodes = seed.data.posts.edges.map((edge) => edge.node);

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
          <Button
            onClick={() => setRepresentations(build())}
            disabled={nodes.length === 0 || entities.isFetching}
          >
            {entities.isFetching ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <PlayIcon />
            )}
            Resolver {pending.length} representações
          </Button>

          {representations ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 font-medium text-xs">Enviado</p>
                {/* biome-ignore lint/a11y/useSemanticElements: the labelled element has to be the <pre> the e2e reads */}
                <pre
                  role="region"
                  aria-label="Representações enviadas"
                  className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]"
                >
                  {JSON.stringify(representations, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-medium text-xs">Recebido</p>
                {entities.error ? (
                  <ErrorNotice
                    title="_entities falhou"
                    error={entities.error}
                  />
                ) : (
                  /* biome-ignore lint/a11y/useSemanticElements: the labelled element has to be the <pre> the e2e reads */
                  <pre
                    role="region"
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
                // biome-ignore lint/suspicious/noArrayIndexKey: _entities is positional — the position is what the badge reports
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
