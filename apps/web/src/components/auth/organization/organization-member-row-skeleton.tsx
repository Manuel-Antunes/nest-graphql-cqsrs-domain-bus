'use client';

import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import { TableCell, TableRow } from '@nestposts/ui/components/ui/table';

import { UserView } from '../user/user-view';

export function OrganizationMemberRowSkeleton({
  showTeams,
}: {
  showTeams?: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <UserView isPending />
      </TableCell>

      <TableCell>
        <Skeleton className="h-4 w-18 rounded-md" />
      </TableCell>

      {showTeams && (
        <TableCell>
          <Skeleton className="h-4 w-24 rounded-md" />
        </TableCell>
      )}

      <TableCell className="flex justify-end">
        <Skeleton className="size-8 rounded-md" />
      </TableCell>
    </TableRow>
  );
}
