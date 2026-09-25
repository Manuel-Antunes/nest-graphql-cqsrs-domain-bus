import Link from 'next/link';
import { Badge } from '@nestposts/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nestposts/ui/components/ui/card';
import {
  ArrowRightIcon,
  KeyRoundIcon,
  NetworkIcon,
  NewspaperIcon,
  PenLineIcon,
  RadioIcon,
  UserIcon,
  WorkflowIcon,
} from 'lucide-react';

import { env } from '@/env.mjs';

const flows = [
  {
    href: '/auth/sign-in',
    icon: KeyRoundIcon,
    title: 'Sign in',
    what: 'better-auth-ui over this app’s own Better Auth: password, magic link, email code, two factor',
    proves:
      'The cookie this application signs is the one the API resolves, and every email a flow sends goes through the notificator.',
  },
  {
    href: '/feed',
    icon: NewspaperIcon,
    title: 'Feed',
    what: 'posts(first:, after:) — cursor connection',
    proves:
      'Paginação Relay e fragmentos por componente: o card não pede `content`.',
  },
  {
    href: '/posts/new',
    icon: PenLineIcon,
    title: 'Escrever',
    what: 'createPost — exige a role author',
    proves:
      'O post nasce na versão 1, SEM tag. Quem completa é o outro serviço.',
  },
  {
    href: '/saga',
    icon: WorkflowIcon,
    title: 'Saga',
    what: 'cria e observa a travessia v1 → v2',
    proves: 'A consistência é eventual, e o tempo dela é mensurável aqui.',
  },
  {
    href: '/live',
    icon: RadioIcon,
    title: 'Tempo real',
    what: 'onPostCreated/onPostUpdated por SSE',
    proves:
      'O transporte é GraphQL over SSE. Contra o Lambda ele NÃO entrega — e a página diz por quê.',
  },
  {
    href: '/me',
    icon: UserIcon,
    title: 'Identidade',
    what: 'me — a interface User, polimórfica',
    proves:
      'possibleTypes no cache, e o perfil de domínio criado no primeiro pedido.',
  },
  {
    href: '/federation',
    icon: NetworkIcon,
    title: 'Federação',
    what: '_entities(representations:)',
    proves: 'Resolve entidade por chave, em lote, e SEM token.',
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Badge variant="outline" className="font-mono text-[10px]">
          cliente de teste
        </Badge>
        <h1 className="text-balance font-semibold text-3xl tracking-tight">
          Sete fluxos, e o que cada um prova
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Este cliente não existe para ser bonito: cada página exercita uma
          decisão de arquitetura do{' '}
          <span className="font-mono text-foreground">nestposts</span> e mostra
          o resultado como ele é — inclusive quando o resultado é que alguma
          coisa não atravessa.
        </p>
        <dl className="grid gap-2 pt-2 text-muted-foreground text-xs sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">Gateway</dt>
            <dd className="break-all font-mono">
              {env.NEXT_PUBLIC_GATEWAY_URL}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Sessão</dt>
            <dd className="break-all font-mono">
              {env.NEXT_PUBLIC_API_URL}/api/auth
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {flows.map((flow) => (
          <Link key={flow.href} href={flow.href} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/25">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <flow.icon
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <CardTitle className="text-base">{flow.title}</CardTitle>
                  <ArrowRightIcon className="ms-auto size-4 opacity-0 transition-opacity group-hover:opacity-60" />
                </div>
                <CardDescription className="font-mono text-[11px]">
                  {flow.what}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {flow.proves}
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
