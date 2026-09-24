'use client';

import { useSyncExternalStore } from 'react';

export function useIsHydrated() {
  const subscribe = () => () => {};
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
