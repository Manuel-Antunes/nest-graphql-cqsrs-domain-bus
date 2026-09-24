import type {
  ComponentPropsWithoutRef,
  ComponentType,
  PropsWithChildren,
  ReactNode,
} from 'react';
import {
  AuthProvider as AuthProviderPrimitive,
  type AuthProviderProps,
} from '@better-auth-ui/react';

import { ErrorToaster } from './error-toaster';

declare module '@better-auth-ui/core' {
  interface AuthConfig {
    Link: ComponentType<
      PropsWithChildren<
        { className?: string; href: string; to?: string } & Pick<
          ComponentPropsWithoutRef<'a'>,
          'aria-disabled' | 'tabIndex' | 'onClick'
        >
      >
    >;
  }

  interface AdditionalFieldRegister {
    label: ReactNode;
  }
}

export function AuthProvider({ children, ...config }: AuthProviderProps) {
  return (
    <AuthProviderPrimitive {...config}>
      {children}

      <ErrorToaster />
    </AuthProviderPrimitive>
  );
}
