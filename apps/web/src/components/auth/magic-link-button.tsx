'use client';

import { type AuthView, authMutationKeys } from '@better-auth-ui/core';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import { buttonVariants } from '@nestposts/ui/components/ui/button';
import { useIsMutating } from '@tanstack/react-query';
import { Lock, Mail } from 'lucide-react';

import { magicLinkPlugin } from '@/lib/auth/magic-link-plugin';
import { cn } from '@/lib/utils';

export type MagicLinkButtonProps = {
  view?: AuthView;
};

export function MagicLinkButton({ view }: MagicLinkButtonProps) {
  const { basePaths, emailAndPassword, viewPaths, localization, Link } =
    useAuth();

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  });
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  });
  const isPending = signInMutating + signUpMutating > 0;

  const { localization: magicLinkLocalization, viewPaths: magicLinkViewPaths } =
    useAuthPlugin(magicLinkPlugin);

  const isMagicLinkView = view === 'magicLink';

  if (isMagicLinkView && !emailAndPassword?.enabled) return null;

  return (
    <Link
      href={`${basePaths.auth}/${isMagicLinkView ? viewPaths.auth.signIn : magicLinkViewPaths.auth.magicLink}`}
      aria-disabled={isPending || undefined}
      tabIndex={isPending ? -1 : undefined}
      onClick={(event) => {
        if (isPending) event.preventDefault();
      }}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'w-full',
        isPending && 'pointer-events-none opacity-50',
      )}
    >
      {isMagicLinkView ? <Lock /> : <Mail />}

      {localization.auth.continueWith.replace(
        '{{provider}}',
        isMagicLinkView
          ? localization.auth.password
          : magicLinkLocalization.magicLink,
      )}
    </Link>
  );
}
