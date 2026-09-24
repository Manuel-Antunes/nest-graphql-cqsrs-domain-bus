'use client';

import {
  type AuthView,
  authMutationKeys,
  getAuthLinkURL,
} from '@better-auth-ui/core';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import { buttonVariants } from '@nestposts/ui/components/ui/button';
import { useIsMutating } from '@tanstack/react-query';
import { KeyRound, Lock } from 'lucide-react';

import { emailOtpPlugin } from '@/lib/auth/email-otp-plugin';
import { cn } from '@/lib/utils';

export type EmailOtpButtonProps = {
  view?: AuthView;
};

export function EmailOtpButton({ view }: EmailOtpButtonProps) {
  const {
    basePaths,
    emailAndPassword,
    localization,
    redirectTo,
    viewPaths,
    Link,
  } = useAuth();
  const { localization: emailOtpLocalization, viewPaths: emailOtpViewPaths } =
    useAuthPlugin(emailOtpPlugin);

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  });
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  });
  const isPending = signInMutating + signUpMutating > 0;

  const isEmailOtpView = view === 'emailOtp';

  if (isEmailOtpView && !emailAndPassword?.enabled) return null;

  return (
    <Link
      href={getAuthLinkURL(
        `${basePaths.auth}/${isEmailOtpView ? viewPaths.auth.signIn : emailOtpViewPaths.auth.emailOtp}`,
        redirectTo,
      )}
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
      {isEmailOtpView ? <Lock /> : <KeyRound />}

      {localization.auth.continueWith.replace(
        '{{provider}}',
        isEmailOtpView
          ? localization.auth.password
          : emailOtpLocalization.emailOtp,
      )}
    </Link>
  );
}
