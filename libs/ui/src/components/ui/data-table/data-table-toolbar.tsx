'use client';

import type React from 'react';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@nestposts/ui/components/ui/dropdown-menu';
import { Input } from '@nestposts/ui/components/ui/input';
import type { Table } from '@tanstack/react-table';
import { ChevronDown, Filter, Search, Trash2 } from 'lucide-react';

import { Separator } from '../separator';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  globalFilter?: string;
  setGlobalFilter?: (value: string) => void;
  searchPlaceholder?: string;
  filterCount?: number;
  title?: string;
  actions?: React.ReactNode;
  rightActions?: React.ReactNode;
  onToggleFilters?: () => void;
  filtersVisible?: boolean;
  filterBar?: React.ReactNode;
  onClearAllFilters?: () => void;
  enableClearAllFilters?: boolean;
  enableColumnChooser?: boolean;
}

export function DataTableToolbar<TData>({
  table,
  globalFilter,
  setGlobalFilter,
  searchPlaceholder = 'Search',
  filterCount = 0,
  title,
  actions,
  rightActions,
  onToggleFilters,
  filtersVisible = true,
  filterBar,
  onClearAllFilters,
  enableClearAllFilters,
  enableColumnChooser = true,
}: DataTableToolbarProps<TData>) {
  const availableColumns = table
    .getAllFlatColumns()
    .filter(
      (column) => column.getCanFilter() && column.columnDef.meta?.filterVariant,
    );

  return (
    <div className="space-y-2 pb-4">
      {(title || rightActions) && (
        <div className="flex items-center justify-between">
          {title && (
            <div className="flex items-center space-x-4">
              <h1 className="font-semibold text-xl">{title}</h1>
            </div>
          )}
          {rightActions}
        </div>
      )}
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-[200px] flex-1 items-center space-x-2">
          {setGlobalFilter && (
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="h-9 w-full pl-8 md:w-[200px]"
              />
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {availableColumns.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 bg-transparent"
              onClick={onToggleFilters}
            >
              <Filter className="mr-2 h-4 w-4" />
              {filtersVisible ? 'Esconder' : 'Exibir'} Filtros
              {filterCount > 0 && <Badge className="ml-2">{filterCount}</Badge>}
            </Button>
          )}

          {enableClearAllFilters && onClearAllFilters && filterCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearAllFilters}
              className="h-9 shrink-0"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Limpar Filtros
            </Button>
          )}

          {enableColumnChooser && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 bg-transparent"
                  />
                }
              >
                Colunas <ChevronDown className="ml-2 h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px]">
                {table
                  .getAllFlatColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => {
                          const hideableVisibleColumns = table
                            .getAllFlatColumns()
                            .filter(
                              (col) => col.getCanHide() && col.getIsVisible(),
                            );
                          if (
                            !value &&
                            hideableVisibleColumns.length <= 1 &&
                            column.getIsVisible()
                          ) {
                            return;
                          }

                          column.toggleVisibility(!!value);
                        }}
                      >
                        {
                          (column.columnDef.meta?.title
                            ? column.columnDef.meta.title
                            : typeof column.columnDef.header === 'string'
                              ? column.columnDef.header
                              : column.columnDef.meta?.title ||
                                column.id) as string
                        }
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {filterBar}
      <Separator />
      {actions && (
        <>
          <div className="flex items-center space-x-2 text-sm">{actions}</div>
          <Separator />
        </>
      )}
    </div>
  );
}
