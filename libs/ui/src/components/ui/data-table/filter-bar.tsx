'use client';

import * as React from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nestposts/ui/components/ui/dropdown-menu';
import type { RowData, Table } from '@tanstack/react-table';
import { ChevronDown, Plus } from 'lucide-react';

import { Separator } from '../separator';
import { FilterChip } from './filter-chip';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    title?: string;
    getRowSpanKey?: (row: TData) => string | number;
    filterVariant?:
      | 'text'
      | 'range'
      | 'select'
      | 'date'
      | 'dateRange'
      | 'async-select';
    filterOptions?: {
      filterKey?: string;
      options?: string[];
      defaultValue?: any;
      placeholder?: string;
      minDate?: Date;
      maxDate?: Date;
      fetcher?: (query?: string) => Promise<any[]>;
      renderOption?: (item: any) => React.ReactNode;
      getOptionValue?: (item: any) => string;
      getDisplayValue?: (item: any) => string;
    };
    disableDrag?: boolean;
    className?: string;
  }
}

interface StaticFilter {
  id: string;
  label: string;
  value: string;
}

interface FilterBarProps<TData> {
  table: Table<TData>;
  staticFilters?: StaticFilter[];
  defaultActiveFilters?: string[];
  onFilterCountChange?: (count: number) => void;
  visible?: boolean;
  clearSignal?: number;
}

export function FilterBar<TData>({
  table,
  staticFilters = [],
  defaultActiveFilters = [],
  onFilterCountChange,
  visible = true,
  clearSignal,
}: FilterBarProps<TData>) {
  const [activeFilters, setActiveFilters] =
    React.useState<string[]>(defaultActiveFilters);

  const defaultsFingerprint = React.useMemo(
    () => [...defaultActiveFilters].sort().join('|'),
    [defaultActiveFilters],
  );

  React.useEffect(() => {
    setActiveFilters((current) => {
      const next = new Set(current);
      let changed = false;
      for (const id of defaultActiveFilters) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? Array.from(next) : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsFingerprint]);

  const previousClearSignal = React.useRef(clearSignal);
  React.useEffect(() => {
    if (
      clearSignal !== undefined &&
      clearSignal !== previousClearSignal.current
    ) {
      previousClearSignal.current = clearSignal;
      setActiveFilters(defaultActiveFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal]);

  const availableColumns = table
    .getAllFlatColumns()
    .filter(
      (column) => column.getCanFilter() && column.columnDef.meta?.filterVariant,
    );

  const addFilter = (columnId: string) => {
    if (!activeFilters.includes(columnId)) {
      const newFilters = [...activeFilters, columnId];
      setActiveFilters(newFilters);
    }
  };

  const removeFilter = (columnId: string) => {
    const newFilters = activeFilters.filter((id) => id !== columnId);
    setActiveFilters(newFilters);
    const column = table.getColumn(columnId);
    if (column) {
      column.setFilterValue(null);
    }
  };

  const activeFilterCount = React.useMemo(() => {
    const dynamicFilterCount = activeFilters.length;

    const staticFilterCount = staticFilters.reduce((count, filter) => {
      const isNotDefault =
        filter.value !== 'Todos' &&
        filter.value !== 'Todas' &&
        !filter.value.includes('Todos');
      return isNotDefault ? count + 1 : count;
    }, 0);

    return dynamicFilterCount + staticFilterCount;
  }, [activeFilters.length, staticFilters]);

  React.useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const addableFilters = React.useMemo(() => {
    return availableColumns.filter(
      (column) => !activeFilters.includes(column.id),
    );
  }, [availableColumns, activeFilters]);

  if (!visible || !availableColumns.length) return null;

  return (
    <>
      <Separator />
      <div className="flex items-center gap-2">
        {staticFilters
          .filter(
            (filter) =>
              filter.value !== 'Todos' &&
              filter.value !== 'Todas' &&
              !filter.value.includes('Todos'),
          )
          .map((filter) => (
            <Button
              key={filter.id}
              variant="outline"
              size="sm"
              className="h-8 border-orange-200 border-dashed bg-orange-50 text-orange-700"
            >
              {filter.label}:{filter.value}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          ))}

        {activeFilters.map((columnId) => {
          const column = table.getColumn(columnId);
          if (!column) return null;

          return (
            <FilterChip
              key={columnId}
              column={column}
              onRemove={() => removeFilter(columnId)}
            />
          );
        })}

        {addableFilters.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                />
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Adicionar Filtro
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {availableColumns
                .filter((column) => !activeFilters.includes(column.id))
                .map((column) => {
                  const header = column.columnDef.meta?.title
                    ? column.columnDef.meta.title
                    : typeof column.columnDef.header === 'string'
                      ? column.columnDef.header
                      : column.columnDef.meta?.title || column.id;
                  return (
                    <DropdownMenuItem
                      key={column.id}
                      onClick={() => addFilter(column.id)}
                    >
                      {header}
                    </DropdownMenuItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </>
  );
}
