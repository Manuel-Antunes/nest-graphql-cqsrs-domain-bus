import { Suspense } from 'react';
import Link from 'next/link';
import { CheckCircle2Icon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WebAuth } from '@/lib/auth/server';
import { API_URL } from '@/lib/env';
import { cn } from '@/lib/utils';

import { LoginForm } from './_components/login-form';

export default async function LoginPage() {
  const session = await WebAuth.session();

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>
            A senha vai para uma{' '}
            <span className="font-mono">server action</span>, que fala com o
            Better Auth desta aplicação e guarda a sessão num cookie{' '}
            <span className="font-mono">httpOnly</span>. O navegador nunca vê o
            token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {session ? (
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Já autenticado como {session.user.email}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  papel{' '}
                  <span className="font-mono">
                    {session.user.role ?? 'nenhum'}
                  </span>
                </p>
                <Link
                  href="/feed"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                  )}
                >
                  Ir para o feed
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <LoginForm />
          </Suspense>

          <p className="text-[11px] break-all text-muted-foreground">
            sessão do Better Auth, na{' '}
            <span className="font-mono">{API_URL}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
