'use client';

import type { ComponentProps } from 'react';
import { useAuth } from '@better-auth-ui/react';

import { cn } from '@/lib/utils';

import { ChangeEmail } from './change-email';
import { UserProfile } from './user-profile';

export type AccountSettingsProps = {
  className?: string;
};

export function AccountSettings({
  className,
  ...props
}: AccountSettingsProps & ComponentProps<'div'>) {
  const { emailAndPassword, plugins } = useAuth();

  const hasMagicLink = plugins.some((plugin) => plugin.id === 'magicLink');

  const ChangeEmailOverride = plugins.find(
    (plugin) => plugin.cardOverrides?.account?.changeEmail,
  )?.cardOverrides?.account?.changeEmail;
  const ChangeEmailCard = ChangeEmailOverride ?? ChangeEmail;

  const showChangeEmail =
    emailAndPassword?.enabled || hasMagicLink || Boolean(ChangeEmailOverride);

  return (
    <div
      className={cn('flex w-full flex-col gap-4 md:gap-6', className)}
      {...props}
    >
      <UserProfile />
      {showChangeEmail && <ChangeEmailCard />}
      {plugins.flatMap(
        (plugin) =>
          plugin.accountCards?.map((Card, index) => (
            <Card key={`${plugin.id}-${index.toString()}`} />
          )) ?? [],
      )}
    </div>
  );
}
