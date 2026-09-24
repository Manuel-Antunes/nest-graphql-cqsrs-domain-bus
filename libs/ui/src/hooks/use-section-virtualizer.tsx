import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface Section<T> {
  title: string;
  data: T[];
}

interface UseSectionVirtualizerProps<T> {
  sections: Section<T>[];
  estimateSize?: number;
  headerHeight?: number;
  tableHeaderHeight?: number;
}

type FlatItem<T> =
  | { type: 'header'; sectionIndex: number; sectionTitle: string }
  | { type: 'item'; sectionIndex: number; itemIndex: number; item: T };

export interface SectionVirtualizer<T> {
  parentRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualItems: VirtualItem[];
  flatItems: FlatItem<T>[];
  stickyHeaderIndex: number | null;
  sectionHeaderVisible: boolean;
  sections: Section<T>[];
}

export function useSectionVirtualizer<T>({
  sections,
  estimateSize = 48,
  headerHeight = 32,
  tableHeaderHeight = 40,
}: UseSectionVirtualizerProps<T>): SectionVirtualizer<T> {
  const parentRef = useRef<HTMLDivElement>(null);
  const [stickyHeaderIndex, setStickyHeaderIndex] = useState<number | null>(
    null,
  );
  const [sectionHeaderVisible, setSectionHeaderVisible] =
    useState<boolean>(true);

  const flatItems = useMemo<FlatItem<T>[]>(() => {
    const list: FlatItem<T>[] = [];

    sections.forEach((section, sIndex) => {
      list.push({
        type: 'header',
        sectionIndex: sIndex,
        sectionTitle: section.title,
      });
      section.data.forEach((item, iIndex) => {
        list.push({
          type: 'item',
          sectionIndex: sIndex,
          itemIndex: iIndex,
          item,
        });
      });
    });

    return list;
  }, [sections]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      flatItems[index].type === 'header' ? headerHeight : estimateSize,
    overscan: 10,
  });

  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      const scrollTop = scrollElement.scrollTop;

      let currentSectionIndex = -1;
      let isSectionHeaderVisible = true;

      for (let i = 0; i < flatItems.length; i++) {
        const item = flatItems[i];

        if (item.type === 'header') {
          const measurements = virtualizer.measurementsCache[i];

          if (measurements) {
            const headerTop = measurements.start;
            const headerBottom = measurements.start + headerHeight;
            const stickyAreaTop = scrollTop + tableHeaderHeight;

            if (headerTop <= stickyAreaTop) {
              currentSectionIndex = item.sectionIndex;

              isSectionHeaderVisible = headerBottom > stickyAreaTop;
            } else {
              break;
            }
          }
        }
      }

      const shouldShowSticky =
        currentSectionIndex >= 0 && !isSectionHeaderVisible && scrollTop > 0;
      setStickyHeaderIndex(shouldShowSticky ? currentSectionIndex : null);
      setSectionHeaderVisible(isSectionHeaderVisible);
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [
    flatItems,
    tableHeaderHeight,
    headerHeight,
    virtualizer.measurementsCache,
  ]);

  return {
    parentRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    flatItems,
    stickyHeaderIndex,
    sectionHeaderVisible,
    sections,
  };
}
