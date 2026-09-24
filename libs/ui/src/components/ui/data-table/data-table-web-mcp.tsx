'use client';

import * as React from 'react';
import { useTool } from '@nestposts/ui/components/web-mcp';
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Table,
} from '@tanstack/react-table';
import * as toon from '@toon-format/toon';
import { type ZodType, z } from 'zod';

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .toLowerCase();
}

export interface DataTableWebMcpProps<
  TData,
  FilterSchema extends ZodType<any>,
> {
  name: string;
  table: Table<TData>;
  total: number;
  filterSchema?: FilterSchema;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  setGlobalFilter: React.Dispatch<React.SetStateAction<string | undefined>>;
  setFiltersVisible: React.Dispatch<React.SetStateAction<boolean>>;
  bumpChipResetSignal: () => void;
  defaultSort?: string;
  defaultSortDir?: 'asc' | 'desc';
  sorting: SortingState;
  pagination: PaginationState;
  columnFilters: ColumnFiltersState;
  globalFilter: string | undefined;
}

export function DataTableWebMcp<TData, FilterSchema extends ZodType<any>>({
  name,
  table,
  total,
  filterSchema,
  setSorting,
  setPagination,
  setColumnFilters,
  setGlobalFilter,
  setFiltersVisible,
  bumpChipResetSignal,
  defaultSort,
  defaultSortDir,
  sorting,
  pagination,
  columnFilters,
  globalFilter,
}: DataTableWebMcpProps<TData, FilterSchema>) {
  const snake = React.useMemo(() => toSnakeCase(name), [name]);

  const sortableIds = React.useMemo(() => {
    return table
      .getAllLeafColumns()
      .filter((c) => c.getCanSort())
      .map((c) => c.id);
  }, [table]);
  const sortableKey = sortableIds.join(',');

  const updateSchema = React.useMemo(() => {
    const sortColumnSchema =
      sortableIds.length > 0 && sortableIds.length <= 25
        ? z.enum(sortableIds as [string, ...string[]])
        : z.string();

    const filterField =
      filterSchema && typeof (filterSchema as any).partial === 'function'
        ? {
            filter: (filterSchema as any)
              .partial()
              .optional()
              .describe(
                'Filter values to apply. Each property is optional; passing null removes that filter. Changing any filter resets the page to 1.',
              ),
          }
        : {};

    return z.object({
      ...filterField,
      search: z
        .string()
        .optional()
        .describe(
          'Free-text global search query. Pass an empty string to clear. Resets the page to 1.',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-indexed page number to navigate to.'),
      perPage: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Number of items per page.'),
      sort: z
        .object({
          column: sortColumnSchema.describe(
            'Column id to sort by. Use inspect_*_table to discover valid ids.',
          ),
          direction: z.enum(['asc', 'desc']),
        })
        .optional()
        .describe('Apply a sort order to the table.'),
      clearAll: z
        .boolean()
        .optional()
        .describe(
          'Clear all filters, search, and chip pills; collapse the filter bar; reset to page 1. Sort order is preserved. Ignored if false.',
        ),
      reset: z
        .boolean()
        .optional()
        .describe(
          'Full table reset: clears filters, search, chip pills, and sort; collapses the filter bar; returns to page 1 with default page size. Use when the user asks to "reset", "restart", or "voltar ao padrão". Takes precedence over `clearAll` and per-field updates when true.',
        ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSchema, sortableKey]);

  type UpdateArgs = z.infer<typeof updateSchema>;

  const getDisplayedRows = React.useCallback(
    () => table.getRowModel().rows.map((row) => row.original),
    [table],
  );

  const waitForRender = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  useTool({
    name: `update_${snake}_table`,
    description:
      `Update the "${name}" data table: change filters, search, pagination, or sorting. ` +
      `Changing filter or search resets the page to 1. Set clearAll=true to reset all filters and search. ` +
      `Returns the rows currently displayed after the update.`,
    parameters: updateSchema,
    execute: async (args: UpdateArgs) => {
      const changed: string[] = [];

      const respond = async (summary: string) => {
        await waitForRender();
        const displayedRows = getDisplayedRows();
        return {
          content: [
            {
              type: 'text',
              text:
                `${summary} Showing ${displayedRows.length} of ${total} row(s).\n\n` +
                `displayedRows:\n${toon.encode(displayedRows)}`,
            },
          ],
        };
      };

      if (args.reset) {
        setColumnFilters([]);
        setGlobalFilter(undefined);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
        setSorting(
          defaultSort
            ? [{ id: defaultSort, desc: defaultSortDir === 'desc' }]
            : [],
        );
        setFiltersVisible(false);
        bumpChipResetSignal();
        return respond(
          `Reset "${name}" table to defaults (filters, search, sort, pagination cleared; chip bar hidden).`,
        );
      }

      if (args.clearAll) {
        setColumnFilters([]);
        setGlobalFilter(undefined);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
        setFiltersVisible(false);
        bumpChipResetSignal();
        return respond(
          `Cleared all filters and search on "${name}" table; chip bar hidden. Sort order preserved.`,
        );
      }

      const filterArg = (args as { filter?: Record<string, unknown> }).filter;
      if (filterArg && filterSchema) {
        setColumnFilters((prev) => {
          const next = new Map<string, unknown>(
            prev.map((f) => [f.id, f.value]),
          );
          for (const [key, value] of Object.entries(filterArg)) {
            if (value == null || value === '') {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          return Array.from(next, ([id, value]) => ({ id, value }));
        });
        setPagination((p) => ({ ...p, pageIndex: 0 }));
        changed.push(`filter=${JSON.stringify(filterArg)}`);
      }

      if (args.search !== undefined) {
        setGlobalFilter(args.search ? args.search : undefined);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
        changed.push(`search="${args.search}"`);
      }

      if (args.perPage !== undefined) {
        setPagination((p) => ({ ...p, pageSize: args.perPage! }));
        changed.push(`perPage=${args.perPage}`);
      }

      if (args.page !== undefined) {
        setPagination((p) => ({
          ...p,
          pageIndex: Math.max(0, args.page! - 1),
        }));
        changed.push(`page=${args.page}`);
      }

      if (args.sort) {
        setSorting([
          { id: args.sort.column, desc: args.sort.direction === 'desc' },
        ]);
        changed.push(`sort=${args.sort.column} ${args.sort.direction}`);
      }

      return respond(
        changed.length
          ? `Updated "${name}" table: ${changed.join(', ')}.`
          : `No changes applied to "${name}" table (no parameters provided).`,
      );
    },
  });

  useTool({
    name: `inspect_${snake}_table`,
    description:
      `Inspect the current state of the "${name}" table. Returns active filters, search query, ` +
      `pagination, sort, total row count, the list of filterable and sortable columns, and the rows ` +
      `currently displayed on the visible page.`,
    parameters: z.object({}),
    readOnly: true,
    execute: () => {
      const filterableColumns = table
        .getAllFlatColumns()
        .filter(
          (c) => c.getCanFilter() && (c.columnDef.meta as any)?.filterVariant,
        )
        .map((c) => {
          const meta = c.columnDef.meta as any;
          return {
            id: c.id,
            title: meta?.title ?? c.id,
            variant: meta?.filterVariant,
            options: meta?.filterOptions?.options,
          };
        });

      const sortableColumns = table
        .getAllLeafColumns()
        .filter((c) => c.getCanSort())
        .map((c) => c.id);

      const sortState = sorting[0]
        ? {
            column: sorting[0].id,
            direction: sorting[0].desc ? 'desc' : 'asc',
          }
        : null;

      const displayedRows = getDisplayedRows();

      return {
        content: [
          {
            type: 'text',
            text: toon.encode({
              tableName: name,
              page: pagination.pageIndex + 1,
              perPage: pagination.pageSize,
              totalRows: total,
              displayedRowCount: displayedRows.length,
              sort: sortState,
              search: globalFilter ?? null,
              filters: columnFilters,
              filterableColumns,
              sortableColumns,
              displayedRows,
            }),
          },
        ],
      };
    },
  });

  return null;
}
