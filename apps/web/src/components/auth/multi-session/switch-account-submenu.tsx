'use client';

import { useAuth, useAuthPlugin, useSession } from '@better-auth-ui/react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from '@nestposts/ui/components/ui/dropdown-menu';
import { ArrowLeftRight } from 'lucide-react';

import { multiSessionPlugin } from '@/lib/auth/multi-session-plugin';

import { SwitchAccountSubmenuContent } from './switch-account-submenu-content';

export type SwitchAccountSubmenuProps = {
  className?: string;
};

export function SwitchAccountSubmenu({ className }: SwitchAccountSubmenuProps) {
  const { authClient } = useAuth();
  const { data: session } = useSession(authClient);
  const { localization: multiSessionLocalization } =
    useAuthPlugin(multiSessionPlugin);

  if (!session) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={className}>
        <ArrowLeftRight className="text-muted-foreground" />

        {multiSessionLocalization.switchAccount}
      </DropdownMenuSubTrigger>

      <SwitchAccountSubmenuContent />
    </DropdownMenuSub>
  );
}
