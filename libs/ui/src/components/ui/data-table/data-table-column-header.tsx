'use client';

import { Button } from '@nestposts/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nestposts/ui/components/ui/dropdown-menu';
import { cn } from '@nestposts/ui/lib/utils';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretSortIcon,
  EyeNoneIcon,
} from '@radix-ui/react-icons';
import type { Column } from '@tanstack/react-table';

type DatagridColumnHeaderProps<TData, TValue> =
  React.HTMLAttributes<HTMLDivElement> & {
    column: Column<TData, TValue>;
    flexRender: React.ReactNode;
  };

export function DatagridColumnHeader<TData, TValue>({
  column,
  flexRender,
  className,
}: Readonly<DatagridColumnHeaderProps<TData, TValue>>) {
  if (!column.getCanSort()) {
    return <div className={cn('text-xs', className)}>{flexRender}</div>;
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 data-[state=open]:bg-accent"
            />
          }
        >
          <span>{flexRender}</span>
          {(() => {
            switch (column.getIsSorted()) {
              case 'desc':
                return <ArrowDownIcon className="ml-2 size-4" />;

              case 'asc':
                return <ArrowUpIcon className="ml-2 size-4" />;

              default:
                return <CaretSortIcon className="ml-2 size-4" />;
            }
          })()}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUpIcon className="mr-2 size-3.5 text-muted-foreground/70" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDownIcon className="mr-2 size-3.5 text-muted-foreground/70" />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeNoneIcon className="mr-2 size-3.5 text-muted-foreground/70" />
            Esconder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
