'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { buttonVariants } from '@nestposts/ui/components/ui/button';
import { RadioIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';

import { useSession } from '@/app/_providers/session-provider';
import { OrganizationSwitcher } from '@/components/auth/organization/organization-switcher';
import { UserButton } from '@/components/auth/user/user-button';
import { upstreamHost } from '@/lib/env';
import { cn } from '@/lib/utils';

const routes = [
  { href: '/', label: 'Roteiro' },
  { href: '/feed', label: 'Feed' },
  { href: '/posts/new', label: 'Escrever' },
  { href: '/saga', label: 'Saga' },
  { href: '/live', label: 'Tempo real' },
  { href: '/me', label: 'Identidade' },
  { href: '/federation', label: 'Federação' },
];

const hasRole = (role: string | null | undefined, wanted: string) =>
  role?.split(',').some((held) => held.trim() === wanted) ?? false;

export function SiteHeader() {
  const pathname = usePathname();
  const { session, isAuthor } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <RadioIcon className="size-4 text-emerald-500" aria-hidden />
          nestposts
        </Link>

        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {routes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                'rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                pathname === route.href && 'bg-accent text-foreground',
              )}
            >
              {route.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <Badge
            variant="outline"
            className="hidden font-mono text-[10px] sm:inline-flex"
          >
            {upstreamHost()}
          </Badge>
          {session ? (
            <>
              <OrganizationSwitcher align="end" />
              <span className="text-muted-foreground text-xs">
                {session.user.email}
                {isAuthor ? (
                  <Badge variant="secondary" className="ms-2 text-[10px]">
                    author
                  </Badge>
                ) : null}
              </span>
              <UserButton
                size="icon"
                align="end"
                links={[
                  {
                    label: 'Organization',
                    href: '/organization/settings',
                    icon: <UsersIcon className="text-muted-foreground" />,
                    visibility: 'authenticated',
                  },
                  ...(hasRole(session.user.role, 'admin')
                    ? [
                        {
                          label: 'Users',
                          href: '/admin/users',
                          icon: (
                            <ShieldCheckIcon className="text-muted-foreground" />
                          ),
                          visibility: 'authenticated' as const,
                        },
                      ]
                    : []),
                ]}
              />
            </>
          ) : (
            <Link
              href="/auth/sign-in"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
