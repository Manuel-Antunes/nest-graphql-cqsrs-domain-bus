'use client';

import { useEffect, useState } from 'react';
import { useAuth, useSendVerificationEmail } from '@better-auth-ui/react';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@nestposts/ui/components/ui/card';
import { FieldDescription } from '@nestposts/ui/components/ui/field';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { OpenEmailButton } from './open-email-button';
import { useIsHydrated } from './use-is-hydrated';

export type VerifyEmailProps = {
  className?: string;
};

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmail({ className }: VerifyEmailProps) {
  const {
    authClient,
    basePaths,
    baseURL,
    localization,
    redirectTo,
    viewPaths,
    Link,
  } = useAuth();

  const isHydrated = useIsHydrated();
  const [email, setEmail] = useState(
    (isHydrated && sessionStorage.getItem('better-auth-ui.verify-email')) || '',
  );
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    setEmail(sessionStorage.getItem('better-auth-ui.verify-email') ?? '');
  }, []);

  useEffect(() => {
    if (cooldown <= 0 || !email) return;

    const interval = setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldown, email]);

  const { mutate: sendVerificationEmail, isPending } = useSendVerificationEmail(
    authClient,
    {
      onSuccess: () => {
        toast.success(localization.auth.verificationEmailSent);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      },
    },
  );

  const isCoolingDown = cooldown > 0;

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <CardTitle className="font-semibold text-xl">
          {localization.auth.verifyEmail}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          <FieldDescription>
            {localization.auth.checkYourEmail}
          </FieldDescription>

          {email && (
            <div className="flex flex-col gap-3">
              <OpenEmailButton email={email} />

              <Button
                type="button"
                variant="outline"
                disabled={!email || isCoolingDown || isPending}
                onClick={() =>
                  sendVerificationEmail({
                    email,
                    callbackURL: `${baseURL}${redirectTo}`,
                  })
                }
              >
                {isPending && <Spinner />}

                {isCoolingDown
                  ? localization.auth.resendIn.replace(
                      '{{seconds}}',
                      String(cooldown),
                    )
                  : localization.auth.resend}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 flex w-full flex-col items-center gap-3">
          <FieldDescription className="text-center">
            {localization.auth.alreadyVerifiedYourEmail}{' '}
            <Link
              href={`${basePaths.auth}/${viewPaths.auth.signIn}`}
              className="underline underline-offset-4"
            >
              {localization.auth.signIn}
            </Link>
          </FieldDescription>
        </div>
      </CardContent>
    </Card>
  );
}
