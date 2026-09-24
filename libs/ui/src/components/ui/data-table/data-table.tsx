'use client';

import * as React from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@nestposts/ui/components/ui/table';
import { useDebounce } from '@nestposts/ui/hooks/use-debounce';
import { usePrevious } from '@nestposts/ui/hooks/use-previous';
import { cn } from '@nestposts/ui/lib/utils';
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useQueryStates } from 'nuqs';
import type { ZodType, z } from 'zod';

import type { DataTableFetchOptions } from '../../server/data-table/datatable-search-loader';
import { dataTableSearchParams } from '../../server/data-table/datatable-search-loader';
import { DatagridColumnHeader } from './data-table-column-header';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTableWebMcp } from './data-table-web-mcp';
import { FilterBar } from './filter-bar';
import { DataTablePagination } from './pagination';
import { SortableHeader } from './sortable-header';

interface StaticFilter {
  id: string;
  label: string;
  value: string;
}

interface DataTableProps<TData, FilterSchema extends ZodType<any>> {
  name?: string;
  className?: string;
  columns: ColumnDef<TData, any>[];
  data: TData[];
  useNuqsState?: boolean;
  total: number;
  onRowClick?: (item: TData) => void;
  searchPlaceholder?: string;
  enableGlobalFilter?: boolean;
  title?: string;
  actions?: React.ReactNode;
  rightActions?: React.ReactNode;
  canViewActions?: boolean;
  staticFilters?: StaticFilter[];
  defaultActiveFilters?: string[];
  defaultHiddenColumns?: string[];
  noItemsMessage?: string | React.ReactNode;
  disableManual?: boolean;
  paginationOptions?: {
    itemsPerPageOptions?: number[];
    showFirstLast?: boolean;
    maxVisiblePages?: number;
    labels?: {
      itemsPerPage?: string;
      showing?: string;
      of?: string;
      items?: string;
    };
  } | null;
  filterSchema?: FilterSchema;
  fetchOptions?: DataTableFetchOptions;
  enableClearAllFilters?: boolean;
  enableColumnChooser?: boolean;
  tableClassName?: string;
  headerClassName?: string;
  cellClassName?: string;
  rowClassName?: string | ((row: TData) => string);
}

function useNuqsTableState<T extends ZodType<any>>(
  filterSchema?: T,
  options?: DataTableFetchOptions,
  enabled = true,
  total = 0,
) {
  const [
    { page, perPage, sort, sortDir, filter, qs },
    setDatagridSearchParams,
  ] = useQueryStates(dataTableSearchParams(filterSchema, options));

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const result = filter
      ? Object.entries(filter).map(([id, value]) => ({
          id,
          value: value,
        }))
      : [];
    return result;
  }, [filter]);

  const pagination = React.useMemo<PaginationState>(
    () => ({
      pageIndex: (page || 1) - 1,
      pageSize: perPage,
    }),
    [page, perPage],
  );

  const sorting = React.useMemo<SortingState>(() => {
    return [
      {
        id: sort,
        desc: sortDir === 'desc',
      },
    ];
  }, [sort, sortDir]);

  const [sa, setSorting] = React.useState<SortingState>(sorting);
  const s = sa[0];
  const [p, setPagination] = React.useState<PaginationState>(pagination);
  const [cF, setColumnFilters] =
    React.useState<ColumnFiltersState>(columnFilters);
  const [gf, setGlobalFilter] = React.useState<string | undefined>();
  const previousSorting = usePrevious(s);
  const previousPagination = usePrevious(p);
  const previousGlobalFilter = usePrevious(qs);

  const debouncedSearchTerm = useDebounce(gf, gf === undefined ? 0 : 300);

  React.useEffect(() => {
    if (!enabled) return;
    setPagination((prev) =>
      prev.pageIndex === pagination.pageIndex &&
      prev.pageSize === pagination.pageSize
        ? prev
        : pagination,
    );
  }, [enabled, pagination]);

  React.useEffect(() => {
    if (!enabled || total <= 0 || perPage <= 0) return;

    const lastPage = Math.max(1, Math.ceil(total / perPage));
    if (page > lastPage) {
      setPagination((prev) => ({ ...prev, pageIndex: lastPage - 1 }));
      setDatagridSearchParams((prev) => ({ ...prev, page: lastPage }));
    }
  }, [enabled, total, page, perPage, setDatagridSearchParams]);

  React.useEffect(() => {
    if (enabled) {
      if (previousSorting?.id !== s?.id || previousSorting?.desc !== s?.desc) {
        setDatagridSearchParams((prev) => ({
          ...prev,
          sort: s?.id,
          sortDir: s?.desc ? 'desc' : 'asc',
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, setDatagridSearchParams, enabled]);

  React.useEffect(() => {
    if (enabled) {
      if (debouncedSearchTerm !== undefined) {
        if (debouncedSearchTerm !== previousGlobalFilter) {
          setDatagridSearchParams((prev) => ({
            ...prev,
            qs: debouncedSearchTerm,
            page: 1,
          }));
          setPagination((prev) =>
            prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 },
          );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, setDatagridSearchParams, enabled]);

  React.useEffect(() => {
    if (enabled) {
      if (
        previousPagination?.pageIndex !== p.pageIndex ||
        previousPagination?.pageSize !== p.pageSize
      ) {
        setDatagridSearchParams((prev) => ({
          ...prev,
          page: p.pageIndex + 1,
          perPage: p.pageSize,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, setDatagridSearchParams, enabled]);

  const filterKey = React.useMemo(
    () =>
      JSON.stringify(
        cF
          .filter((f) => f.value != null)
          .map((f) => [f.id, f.value] as const)
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ),
    [cF],
  );
  const previousFilterKey = usePrevious(filterKey);

  React.useEffect(() => {
    if (!enabled) return;
    if (previousFilterKey === undefined || previousFilterKey === filterKey) {
      return;
    }

    const normalizedFilter = Object.fromEntries(
      cF.filter((f) => f.value != null).map((f) => [f.id, f.value]),
    );

    setDatagridSearchParams((prev) => ({
      ...prev,
      filter: (filterSchema ? (normalizedFilter as z.infer<T>) : '') as never,
      page: 1,
    }));
    setPagination((prev) =>
      prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    filterKey,
    previousFilterKey,
    filterSchema,
    setDatagridSearchParams,
  ]);

  return {
    sorting: enabled ? sorting : sa,
    pagination: enabled ? pagination : p,
    setSorting,
    setPagination,
    columnFilters: enabled ? columnFilters : cF,
    setColumnFilters,
    globalFilter: enabled ? (gf !== undefined ? gf : qs) : gf,
    setGlobalFilter,
  };
}

export function DataTable<TData, FilterSchema extends ZodType<any>>({
  name,
  columns,
  data,
  className,
  searchPlaceholder = 'Buscar',
  noItemsMessage = 'Nenhum item encontrado.',
  enableGlobalFilter = true,
  title,
  actions,
  rightActions,
  canViewActions = true,
  staticFilters = [],
  onRowClick,
  defaultActiveFilters = [],
  defaultHiddenColumns = [],
  paginationOptions = {},
  total,
  filterSchema,
  disableManual = false,
  enableClearAllFilters,
  fetchOptions,
  useNuqsState = true,
  enableColumnChooser,
  cellClassName,
  headerClassName,
  rowClassName,
  tableClassName,
}: DataTableProps<TData, FilterSchema>) {
  const { defaultSort = 'createdAt', defaultSortDir = 'desc' } =
    fetchOptions || {};
  const {
    sorting,
    pagination,
    setSorting,
    setPagination,
    columnFilters,
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
  } = useNuqsTableState(filterSchema, fetchOptions, useNuqsState, total);

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => {
      const initialVisibility: VisibilityState = {};
      defaultHiddenColumns.forEach((columnId) => {
        initialVisibility[columnId] = false;
      });
      return initialVisibility;
    });
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnOrder, setColumnOrder] = React.useState<string[]>([]);

  const defFilters = [
    ...defaultActiveFilters,
    ...columnFilters.map((f) => f.id),
  ];
  const [filtersVisible, setFiltersVisible] = React.useState(
    defFilters.length > 0,
  );

  const previousFilterCount = usePrevious(columnFilters.length);
  React.useEffect(() => {
    if (
      columnFilters.length > 0 &&
      (previousFilterCount ?? columnFilters.length) === 0
    ) {
      setFiltersVisible(true);
    }
  }, [columnFilters.length, previousFilterCount]);

  const [chipResetSignal, setChipResetSignal] = React.useState(0);

  const [defaultsInitialized, setDefaultsInitialized] = React.useState(false);

  const table = useReactTable({
    data,
    columns,
    manualPagination: !disableManual,
    manualSorting: !disableManual,
    initialState: {
      sorting: [
        {
          desc: defaultSortDir === 'desc',
          id: defaultSort,
        },
      ],
    },
    manualFiltering: !disableManual,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    globalFilterFn: 'includesString',
    onGlobalFilterChange: setGlobalFilter,
    pageCount: Math.ceil(total / pagination.pageSize),
    getPaginationRowModel: getPaginationRowModel(), //load client-side pagination code
    getFilteredRowModel: getFilteredRowModel(), //load client-side filtering code
    getSortedRowModel: getSortedRowModel(), //load client-side sorting code
    state: {
      pagination,
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      columnOrder,
      globalFilter,
    },
    getCoreRowModel: getCoreRowModel(),
  });
  const [filterCount, setFilterCount] = React.useState(0);

  const getLeafColumns = React.useCallback(
    (cols: ColumnDef<TData, any>[]): ColumnDef<TData, any>[] => {
      const leaves: ColumnDef<TData, any>[] = [];
      const recurse = (columns: ColumnDef<TData, any>[]) => {
        columns.forEach((col) => {
          if ('columns' in col && col.columns && col.columns.length > 0) {
            recurse(col.columns);
          } else {
            leaves.push(col);
          }
        });
      };
      recurse(cols);
      return leaves;
    },
    [],
  );

  const leafColumns = React.useMemo(
    () => getLeafColumns(columns),
    [columns, getLeafColumns],
  );

  const rowSpans = React.useMemo(() => {
    const spans: Record<
      string,
      Map<string | number, { rowSpan: number; firstRow: number }>
    > = {};

    leafColumns.forEach((column) => {
      if (column.meta?.getRowSpanKey) {
        const getRowSpanKey = column.meta.getRowSpanKey;
        const columnId = column.id;

        if (columnId) {
          const columnSpans = new Map<
            string | number,
            { rowSpan: number; firstRow: number }
          >();
          const groups = new Map<string | number, number[]>();

          data.forEach((row, index) => {
            const key = getRowSpanKey(row);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(index);
          });

          groups.forEach((indices, key) => {
            const rowSpan = indices.length;
            const firstRow = indices[0];
            columnSpans.set(key, { rowSpan, firstRow });
          });

          spans[columnId] = columnSpans;
        }
      }
    });

    return spans;
  }, [data, leafColumns]);

  React.useEffect(() => {
    if (!defaultsInitialized && defaultActiveFilters.length > 0) {
      const currentFilterIds = columnFilters.map((f) => f.id);
      const missingDefaults = defaultActiveFilters.filter(
        (filterId) => !currentFilterIds.includes(filterId),
      );

      if (missingDefaults.length > 0) {
        const newFilters = [...columnFilters];
        missingDefaults.forEach((filterId) => {
          const column = table.getColumn(filterId);
          if (column) {
            const defaultValue =
              column.columnDef.meta?.filterOptions?.defaultValue;
            if (defaultValue !== undefined) {
              newFilters.push({ id: filterId, value: defaultValue });
            }
          }
        });
        if (newFilters.length > columnFilters.length) {
          setColumnFilters(newFilters);
        }
      }
      setDefaultsInitialized(true);
    }
  }, [
    defaultsInitialized,
    defaultActiveFilters,
    columnFilters,
    table,
    setColumnFilters,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = table
        .getAllLeafColumns()
        .findIndex((column) => column.id === active.id);
      const newIndex = table
        .getAllLeafColumns()
        .findIndex((column) => column.id === over?.id);

      const newColumnOrder = arrayMove(
        table.getAllLeafColumns().map((c) => c.id),
        oldIndex,
        newIndex,
      );

      setColumnOrder(newColumnOrder);
    }
  }

  function handleClearAllFilters() {
    table.resetColumnFilters();
    table.resetGlobalFilter();
    table.resetSorting();
    setColumnFilters([]);
    setGlobalFilter('');
    table.setPageIndex(0);
  }

  const toggleFilters = () => {
    setFiltersVisible(!filtersVisible);
  };

  return (
    <div className={cn('space-y-0 overflow-x-auto', className)}>
      {name ? (
        <DataTableWebMcp
          name={name}
          table={table}
          total={total}
          filterSchema={filterSchema}
          setSorting={setSorting}
          setPagination={setPagination}
          setColumnFilters={setColumnFilters}
          setGlobalFilter={setGlobalFilter}
          setFiltersVisible={setFiltersVisible}
          bumpChipResetSignal={() => setChipResetSignal((n) => n + 1)}
          defaultSort={defaultSort}
          defaultSortDir={defaultSortDir}
          sorting={sorting}
          pagination={pagination}
          columnFilters={columnFilters}
          globalFilter={globalFilter}
        />
      ) : null}
      <DataTableToolbar
        table={table}
        globalFilter={enableGlobalFilter ? globalFilter : undefined}
        setGlobalFilter={enableGlobalFilter ? setGlobalFilter : undefined}
        searchPlaceholder={searchPlaceholder}
        filterCount={filterCount}
        title={title}
        actions={canViewActions ? actions : undefined}
        rightActions={rightActions}
        onToggleFilters={toggleFilters}
        filtersVisible={filtersVisible}
        filterBar={
          <FilterBar
            table={table}
            staticFilters={staticFilters}
            defaultActiveFilters={defFilters}
            onFilterCountChange={setFilterCount}
            visible={filtersVisible}
            clearSignal={chipResetSignal}
          />
        }
        enableClearAllFilters={enableClearAllFilters}
        onClearAllFilters={handleClearAllFilters}
        enableColumnChooser={enableColumnChooser}
      />

      <div className="relative w-full rounded-md border bg-card">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table className={tableClassName}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b bg-muted/50">
                  <SortableContext
                    items={headerGroup.headers.map((h) => h.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header) => (
                      <SortableHeader
                        key={header.id}
                        header={header}
                        colSpan={header.colSpan}
                        className={cn(
                          headerClassName,
                          header.column.columnDef.meta?.className,
                        )}
                      >
                        <DatagridColumnHeader
                          column={header.column}
                          flexRender={flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        />
                      </SortableHeader>
                    ))}
                  </SortableContext>
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => {
                  const cellsToRender = row.getVisibleCells().filter((cell) => {
                    const getRowSpanKey =
                      cell.column.columnDef.meta?.getRowSpanKey;
                    if (getRowSpanKey) {
                      const key = getRowSpanKey(row.original);
                      const spanInfo = rowSpans[cell.column.id]?.get(key);
                      return spanInfo?.firstRow === row.index;
                    }
                    return true;
                  });
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={cn(
                        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
                        onRowClick && 'cursor-pointer',
                        typeof rowClassName === 'function'
                          ? rowClassName(row.original)
                          : rowClassName,
                      )}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {cellsToRender.map((cell) => {
                        const column = cell.column;
                        const getRowSpanKey =
                          column.columnDef.meta?.getRowSpanKey;
                        if (getRowSpanKey) {
                          const key = getRowSpanKey(row.original);
                          const spanInfo = rowSpans[column.id]?.get(key);
                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(cellClassName)}
                              rowSpan={spanInfo?.rowSpan || 1}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell
                            key={cell.id}
                            className={cn(cellClassName)}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    {noItemsMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>

      {paginationOptions !== null && (
        <DataTablePagination
          table={table}
          totalItems={total}
          {...paginationOptions}
        />
      )}
    </div>
  );
}
