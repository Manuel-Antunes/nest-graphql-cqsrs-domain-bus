'use client';

import { useMemo } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@nestposts/ui/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';
import type { Table } from '@tanstack/react-table';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  totalItems: number;
  itemsPerPageOptions?: number[];
  showFirstLast?: boolean;
  maxVisiblePages?: number;
  labels?: {
    itemsPerPage?: string;
    showing?: string;
    of?: string;
    items?: string;
  };
}

export function DataTablePagination<TData>({
  table,
  totalItems,
  itemsPerPageOptions = [10, 15, 20, 30, 50],
  showFirstLast = true,
  maxVisiblePages = 5,
  labels = {
    itemsPerPage: 'Itens por página',
    showing: 'Exibindo de',
    of: 'de',
    items: 'itens',
  },
}: DataTablePaginationProps<TData>) {
  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = table.getPageCount();
  const { pageSize } = table.getState().pagination;
  const startItem = table.getState().pagination.pageIndex * pageSize + 1;
  const endItem = Math.min(startItem + pageSize - 1, totalItems);

  const visiblePages = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    const halfVisible = Math.floor(maxVisiblePages / 2);

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i += 1) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let startPage = Math.max(2, currentPage - halfVisible);
      let endPage = Math.min(totalPages - 1, currentPage + halfVisible);

      if (currentPage <= halfVisible + 1) {
        endPage = Math.min(totalPages - 1, maxVisiblePages - 1);
      }

      if (currentPage >= totalPages - halfVisible) {
        startPage = Math.max(2, totalPages - maxVisiblePages + 2);
      }

      if (startPage > 2) {
        pages.push('ellipsis');
      }

      for (let i = startPage; i <= endPage; i += 1) {
        pages.push(i);
      }

      if (endPage < totalPages - 1) {
        pages.push('ellipsis');
      }

      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  }, [currentPage, maxVisiblePages, totalPages]);

  return (
    <div className="flex flex-col items-center justify-between gap-2 py-4 md:flex-row">
      <div className="flex items-center space-x-2">
        <p className="text-muted-foreground text-sm">{labels.itemsPerPage}:</p>
        <Select
          value={`${pageSize}`}
          onValueChange={(value) => {
            table.setPageSize(Number(value));
          }}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue placeholder={pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {itemsPerPageOptions.map((size) => (
              <SelectItem key={size} value={`${size}`}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <p className="text-muted-foreground text-sm">
          {labels.showing} {startItem} a {endItem} {labels.of} {totalItems}{' '}
          {labels.items}
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Pagination>
          <PaginationContent>
            {showFirstLast && (
              <PaginationItem>
                <PaginationFirst
                  onClick={() => table.setPageIndex(0)}
                  className={
                    currentPage === 1
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            )}

            <PaginationItem>
              <PaginationPrevious
                onClick={() => table.previousPage()}
                className={
                  !table.getCanPreviousPage()
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>

            {visiblePages.map((page, index) => (
              <PaginationItem key={index}>
                {page === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    onClick={() => table.setPageIndex(page - 1)}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                onClick={() => table.nextPage()}
                className={
                  !table.getCanNextPage()
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>

            {showFirstLast && (
              <PaginationItem>
                <PaginationLast
                  onClick={() => table.setPageIndex(totalPages - 1)}
                  className={
                    currentPage === totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
