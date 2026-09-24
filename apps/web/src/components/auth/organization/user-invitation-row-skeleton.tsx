'use client';

import { Item, ItemContent, ItemMedia } from '@nestposts/ui/components/ui/item';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';

export function UserInvitationRowSkeleton() {
  return (
    <Item>
      <ItemMedia>
        <Skeleton className="size-10 shrink-0 rounded-md" />
      </ItemMedia>
      <ItemContent>
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-3 w-28 rounded-md" />
      </ItemContent>
    </Item>
  );
}
