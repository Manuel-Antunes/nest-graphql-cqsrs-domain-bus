'use client';

import { useAuthPlugin } from '@better-auth-ui/react';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@nestposts/ui/components/ui/empty';
import { Send } from 'lucide-react';

import { organizationPlugin } from '@/lib/auth/organization-plugin';

export type OrganizationInvitationsEmptyProps = {
  isInvitePending?: boolean;
  onInvitePress?: () => void;
};

export function OrganizationInvitationsEmpty({
  isInvitePending,
  onInvitePress,
}: OrganizationInvitationsEmptyProps) {
  const { localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Send />
        </EmptyMedia>
        <EmptyTitle>{organizationLocalization.noInvitations}</EmptyTitle>
        <EmptyDescription>
          {organizationLocalization.organizationInvitationsEmptyDescription}
        </EmptyDescription>
      </EmptyHeader>
      {(isInvitePending || onInvitePress) && (
        <EmptyContent>
          <Button disabled={isInvitePending} size="sm" onClick={onInvitePress}>
            {organizationLocalization.inviteMember}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
