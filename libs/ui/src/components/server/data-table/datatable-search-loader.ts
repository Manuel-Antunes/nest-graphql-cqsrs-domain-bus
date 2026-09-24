import { parseAsInteger, parseAsJson, parseAsString } from 'nuqs/server';
import type z from 'zod';
import type { ZodType } from 'zod';

export interface DataTableFetchOptions<TFilter = any> {
  defaultSort?: string;
  defaultSortDir?: 'asc' | 'desc';
  defaultPerPage?: number;
  defaultPage?: number;
  defaultFilter?: TFilter;
}

export function dataTableSearchParams<T extends ZodType<any>>(
  filterSchema?: T | undefined,
  options?: DataTableFetchOptions<z.infer<T>>,
) {
  const {
    defaultSort = 'createdAt',
    defaultSortDir = 'desc',
    defaultPerPage = 15,
    defaultPage = 1,
    defaultFilter,
  } = options || {};
  const stringFilter = parseAsString.withDefault('');
  const schemaFilter = filterSchema
    ? parseAsJson<z.infer<T>>(filterSchema.parse).withDefault(
        (defaultFilter ?? {}) as z.infer<T>,
      )
    : undefined;
  const filter = (
    filterSchema ? schemaFilter : stringFilter
  ) as typeof schemaFilter extends undefined
    ? typeof stringFilter
    : NonNullable<typeof schemaFilter>;

  return {
    perPage: parseAsInteger.withDefault(defaultPerPage),
    page: parseAsInteger.withDefault(defaultPage),
    sort: parseAsString.withDefault(defaultSort),
    sortDir: parseAsString.withDefault(defaultSortDir),
    qs: parseAsString.withDefault(''),
    filter: filter,
  };
}
