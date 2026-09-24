import { TENANT_HEADER } from '@/lib/env';

let current: string | null = null;

export const TenantHeader = {
  set(slug: string | null): void {
    current = slug;
  },

  headers(): Record<string, string> {
    return current ? { [TENANT_HEADER]: current } : {};
  },
};
