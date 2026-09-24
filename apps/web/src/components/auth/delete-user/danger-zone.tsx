'use client';

import type { ComponentProps } from 'react';
import { useAuth } from '@better-auth-ui/react';

import { cn } from '@/lib/utils';

import { DeleteAccount } from './delete-account';

export type DangerZoneProps = {
  className?: string;
};

export function DangerZone({
  className,
  ...props
}: DangerZoneProps & Omit<ComponentProps<'div'>, 'children' | 'className'>) {
  const { localization } = useAuth();

  return (
    <div className={cn('flex w-full flex-col', className)} {...props}>
      <h2 className="mb-3 font-semibold text-destructive text-sm">
        {localization.settings.dangerZone}
      </h2>

      <DeleteAccount />
    </div>
  );
}
