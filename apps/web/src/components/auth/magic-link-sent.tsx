'use client';

import { useEffect, useState } from 'react';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@nestposts/ui/components/ui/card';
import { FieldDescription } from '@nestposts/ui/components/ui/field';

import { magicLinkPlugin } from '@/lib/auth/magic-link-plugin';
import { cn } from '@/lib/utils';

import { OpenEmailButton } from './open-email-button';
import { useIsHydrated } from './use-is-hydrated';

export const MAGIC_LINK_SENT_STORAGE_KEY = 'better-auth-ui.magic-link-sent';

export type MagicLinkSentProps = {
  className?: string;
};

export function MagicLinkSent({ className }: MagicLinkSentProps) {
  const { basePaths, emailAndPassword, localization, viewPaths, Link } =
    useAuth();
  const { localization: magicLinkLocalization } =
    useAuthPlugin(magicLinkPlugin);

  const isHydrated = useIsHydrated();
  const [email, setEmail] = useState(
    (isHydrated && sessionStorage.getItem(MAGIC_LINK_SENT_STORAGE_KEY)) || '',
  );

  useEffect(() => {
    setEmail(sessionStorage.getItem(MAGIC_LINK_SENT_STORAGE_KEY) ?? '');
  }, []);

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <CardTitle className="font-semibold text-xl">
          {localization.auth.checkYourEmailTitle}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          <FieldDescription>
            {email
              ? magicLinkLocalization.magicLinkSentTo.replace(
                  '{{email}}',
                  email,
                )
              : magicLinkLocalization.magicLinkSent}
          </FieldDescription>

          {email && <OpenEmailButton email={email} />}
        </div>

        {emailAndPassword?.enabled && (
          <div className="mt-4 flex w-full flex-col items-center gap-3">
            <FieldDescription className="text-center">
              {localization.auth.needToCreateAnAccount}{' '}
              <Link
                href={`${basePaths.auth}/${viewPaths.auth.signUp}`}
                className="underline underline-offset-4"
              >
                {localization.auth.signUp}
              </Link>
            </FieldDescription>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
