import { Endpoints } from '@/lib/endpoints';

let current: string | null = null;

export const TenantHeader = {
  set(slug: string | null): void {
    current = slug;
  },

  headers(): Record<string, string> {
    return current ? { [Endpoints.tenantHeader]: current } : {};
  },
};
