import { Cursor } from '@mikro-orm/core';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

const PageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  startCursor: z.string().nullable(),
  endCursor: z.string().nullable(),
});

@InheritValidatedMetadata()
export class PageInfo extends ValidatedDto(PageInfoSchema) {}

export interface Edge<T> {
  cursor: string;
  node: T;
}

export interface ConnectionType<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
  totalCount?: number | null;
}

export interface Page<E> {
  readonly items: E[];
  from(item: E): string;
  readonly hasNextPage: boolean;
  readonly hasPrevPage: boolean;
  readonly startCursor: string | null;
  readonly endCursor: string | null;
  readonly totalCount?: number;
}

export function pageOf<E extends object>(
  items: readonly E[],
  limit: number,
  after?: string | null,
): Page<E> {
  const start = after ? Number(Cursor.decode(after)[0]) + 1 : 0;
  const slice = items.slice(start, start + limit);
  const cursors = new Map(
    slice.map((item, offset) => [item, Cursor.encode([start + offset])]),
  );

  return {
    items: slice,
    from: (item) => cursors.get(item)!,
    hasNextPage: start + limit < items.length,
    hasPrevPage: start > 0,
    startCursor: cursors.get(slice[0]) ?? null,
    endCursor: cursors.get(slice[slice.length - 1]) ?? null,
    totalCount: items.length,
  };
}

export function connectionOf<E extends object, T>(
  page: Page<E>,
  node: (item: E) => T,
): ConnectionType<T> {
  const edges = page.items.map((item) => ({
    cursor: page.from(item),
    node: node(item),
  }));
  return {
    edges,
    pageInfo: {
      hasNextPage: page.hasNextPage,
      hasPreviousPage: page.hasPrevPage,
      startCursor: page.startCursor,
      endCursor: page.endCursor,
    },
    totalCount: page.totalCount,
  };
}
