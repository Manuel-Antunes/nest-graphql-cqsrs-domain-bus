'use client';

import React from 'react';
import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { cn } from '@nestposts/ui/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { MotionValue } from 'motion/react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from 'motion/react';

import type { Section } from '../../hooks/use-section-virtualizer';
import { useSectionVirtualizer } from '../../hooks/use-section-virtualizer';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

const MotionCustomTableRow = motion(TableRow);

interface VirtualSectionTableProps<T, S extends Section<T>> {
  sections: S[];
  columns: ColumnDef<T>[];
  height?: number;
  estimateRowSize?: number;
  estimateSectionHeaderSize?: number;
  className?: string;
  onLoadMore?: () => void;
  renderSectionHeader?: (section: {
    title: string;
    index: number;
    section: S;
    scrollableWidth: number;
    scrollLeftSpring: MotionValue<number>;
  }) => React.ReactNode;
  sectionHeaderClassName?: string;
}

export function VirtualSectionTable<T, S extends Section<T>>({
  sections,
  columns,
  height = 600,
  estimateRowSize = 60,
  estimateSectionHeaderSize = 40,
  className = '',
  onLoadMore,
  renderSectionHeader,
  sectionHeaderClassName = 'bg-gray-100 border-b px-2 text-sm',
}: VirtualSectionTableProps<T, S>) {
  const tableHeaderRef = React.useRef<HTMLTableSectionElement>(null);
  const scrollableRef = React.useRef<HTMLDivElement>(null);
  const horizontalScrollRef = React.useRef<HTMLDivElement>(null);
  const [tableHeaderHeight, setTableHeaderHeight] = React.useState(41);

  const scrollLeftMotion = useMotionValue(0);
  const scrollLeftSpring = useSpring(scrollLeftMotion, {
    stiffness: 500,
    damping: 30,
    mass: 0.1,
  });

  const scrollState$ = React.useMemo(
    () =>
      observable({
        scrollableWidth: 0,
      }),
    [],
  );

  const scrollableWidth = useSelector(() => scrollState$.scrollableWidth.get());

  const {
    parentRef,
    virtualItems,
    flatItems,
    stickyHeaderIndex,
    sectionHeaderVisible,
    virtualizer,
  } = useSectionVirtualizer({
    sections,
    estimateSize: estimateRowSize,
    headerHeight: estimateSectionHeaderSize,
    tableHeaderHeight,
  });

  const tableColumns = React.useMemo<ColumnDef<T>[]>(() => columns, [columns]);

  const table = useReactTable({
    data: sections.flatMap((s) => s.data),
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalColumnWidth = React.useMemo(() => {
    return tableColumns.reduce((sum, col) => sum + (col.size || 150), 0);
  }, [tableColumns]);

  React.useEffect(() => {
    if (tableHeaderRef.current) {
      const height = tableHeaderRef.current.getBoundingClientRect().height;
      setTableHeaderHeight(height);
    }
  }, []);

  React.useEffect(() => {
    if (!horizontalScrollRef.current) return;

    const updateWidth = () => {
      if (horizontalScrollRef.current) {
        scrollState$.scrollableWidth.set(
          horizontalScrollRef.current.clientWidth,
        );
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(horizontalScrollRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollState$]);

  React.useEffect(() => {
    if (!horizontalScrollRef.current) return;

    const handleScroll = () => {
      if (!horizontalScrollRef.current) return;
      const targetScrollLeft = horizontalScrollRef.current.scrollLeft;
      scrollLeftMotion.set(targetScrollLeft);
    };

    const scrollContainer = horizontalScrollRef.current;
    scrollContainer.addEventListener('scroll', handleScroll, {
      passive: true,
    });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [scrollLeftMotion]);

  React.useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();

    if (!lastItem) return;

    if (lastItem.index >= flatItems.length - 1 && onLoadMore) {
      onLoadMore();
    }
  }, [virtualItems, flatItems.length, onLoadMore]);

  const stickyHeaderContent = React.useMemo(() => {
    if (stickyHeaderIndex === null || stickyHeaderIndex < 0) return null;

    const section = sections[stickyHeaderIndex];
    if (!section) return null;

    if (renderSectionHeader) {
      return renderSectionHeader({
        title: section.title,
        index: stickyHeaderIndex,
        section,
        scrollableWidth,
        scrollLeftSpring,
      });
    }

    return section.title;
  }, [
    stickyHeaderIndex,
    sections,
    renderSectionHeader,
    scrollableWidth,
    scrollLeftSpring,
  ]);

  return (
    <div ref={horizontalScrollRef} className="overflow-x-auto">
      <div className={cn('relative w-max', className)}>
        <AnimatePresence mode="wait">
          {stickyHeaderContent && !sectionHeaderVisible && (
            <motion.div
              key="sticky-header"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{
                duration: 0.2,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="pointer-events-none absolute left-0 z-10 w-full"
              style={{
                top: `${tableHeaderHeight}px`,
                height: `${estimateSectionHeaderSize}px`,
              }}
            >
              <div
                className={cn(
                  'flex h-full items-center',
                  sectionHeaderClassName,
                )}
              >
                {stickyHeaderContent}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          ref={(node) => {
            parentRef.current = node;
            scrollableRef.current = node;
          }}
          className="w-full overflow-y-auto rounded-md border"
          style={{ height }}
        >
          <table
            className="caption-bottom text-sm"
            style={{ tableLayout: 'auto', minWidth: '100%' }}
          >
            <TableHeader
              ref={tableHeaderRef}
              className="sticky top-0 z-20 bg-background"
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody
              className="relative"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((virtualItem) => {
                const item = flatItems[virtualItem.index];

                if (item.type === 'header') {
                  const sectionContent = renderSectionHeader
                    ? renderSectionHeader({
                        title: item.sectionTitle,
                        index: item.sectionIndex,
                        section: sections[item.sectionIndex],
                        scrollableWidth,
                        scrollLeftSpring,
                      })
                    : item.sectionTitle;

                  return (
                    <MotionCustomTableRow
                      key={`section-${item.sectionIndex}`}
                      className="absolute left-0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: 0.3,
                        ease: [0.25, 0.1, 0.25, 1],
                      }}
                      style={{
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                        display: 'table',
                        tableLayout: 'fixed',
                        width: `${totalColumnWidth}px`,
                        minWidth: '100%',
                      }}
                    >
                      <TableCell
                        colSpan={tableColumns.length}
                        className={cn('p-2', sectionHeaderClassName)}
                        style={{ display: 'table-cell' }}
                      >
                        {sectionContent}
                      </TableCell>
                    </MotionCustomTableRow>
                  );
                }

                const rowData = item.item;

                return (
                  <MotionCustomTableRow
                    key={`item-${item.sectionIndex}-${item.itemIndex}`}
                    className="absolute left-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: 0.2,
                      delay: 0.02 * (virtualItem.index % 10),
                      ease: [0.25, 0.1, 0.25, 1],
                    }}
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                      display: 'table',
                      tableLayout: 'fixed',
                      width: `${totalColumnWidth}px`,
                      minWidth: '100%',
                    }}
                  >
                    {tableColumns.map((column, colIndex) => (
                      <TableCell
                        key={column.id || colIndex}
                        style={{
                          width: column.size,
                          display: 'table-cell',
                        }}
                      >
                        {typeof column.cell === 'function'
                          ? flexRender(column.cell, {
                              row: {
                                original: rowData,
                                index: item.itemIndex,
                              },
                              column: table.getAllColumns()[colIndex],
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            } as any)
                          : column.cell}
                      </TableCell>
                    ))}
                  </MotionCustomTableRow>
                );
              })}
            </TableBody>
          </table>
        </div>
      </div>
    </div>
  );
}
