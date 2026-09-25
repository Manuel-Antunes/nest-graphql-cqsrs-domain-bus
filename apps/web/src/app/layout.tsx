import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { prefetchSessionServer } from '@better-auth-ui/core/server';
import { Toaster } from '@nestposts/ui/components/ui/sonner';
import { dehydrate } from '@tanstack/react-query';

import { SiteHeader } from '@/app/_components/site-header';
import { Providers } from '@/app/_providers';
import { WebAuth } from '@/lib/auth/server';
import { getQueryClient } from '@/lib/query-client';

import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'nestposts · cliente de teste',
  description:
    'Cliente GraphQL para exercitar os fluxos do blog: saga coreografada, federação e identidade.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = getQueryClient();
  await prefetchSessionServer(queryClient, await WebAuth.server(), {
    headers: await headers(),
  });

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers
          socialProviders={WebAuth.socialProviders()}
          billing={WebAuth.billingEnabled()}
          dehydratedState={dehydrate(queryClient)}
        >
          <SiteHeader />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
