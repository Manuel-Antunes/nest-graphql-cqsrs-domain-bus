'use client';

import { useMemo } from 'react';
import { type AuthView, getProviderId } from '@better-auth-ui/core';
import { useAuth } from '@better-auth-ui/react';

import { cn } from '@/lib/utils';

import { ProviderButton } from './provider-button';

export type ProviderButtonsProps = {
  socialLayout?: SocialLayout;
  view?: AuthView;
};

export type SocialLayout = 'auto' | 'horizontal' | 'vertical' | 'grid';

export function ProviderButtons({
  socialLayout = 'auto',
  view = 'signIn',
}: ProviderButtonsProps) {
  const { socialProviders } = useAuth();

  const resolvedSocialLayout = useMemo(() => {
    if (socialLayout === 'auto') {
      if (socialProviders?.length && socialProviders.length >= 4) {
        return 'horizontal';
      }

      return 'vertical';
    }

    return socialLayout;
  }, [socialLayout, socialProviders?.length]);

  return (
    <div
      className={cn(
        'gap-3',
        resolvedSocialLayout === 'grid' && 'grid grid-cols-2',
        resolvedSocialLayout === 'vertical' && 'flex flex-col',
        resolvedSocialLayout === 'horizontal' && 'flex flex-row flex-wrap',
      )}
    >
      {socialProviders?.map((provider) => (
        <ProviderButton
          key={getProviderId(provider)}
          provider={provider}
          view={view}
          display={
            resolvedSocialLayout === 'vertical'
              ? 'full'
              : resolvedSocialLayout === 'grid'
                ? 'name'
                : 'icon'
          }
          className={cn(resolvedSocialLayout === 'horizontal' && 'flex-1')}
        />
      ))}
    </div>
  );
}
