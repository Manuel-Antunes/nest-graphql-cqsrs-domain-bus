import type * as React from 'react';
import { cn } from '@nestposts/ui/lib/utils';

type DashboardShellProps = React.HTMLAttributes<HTMLDivElement>;

export function DashboardShell({
  children,
  className,
  ...props
}: DashboardShellProps) {
  return (
    <div
      className={cn('grid items-start gap-8 px-4 py-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
