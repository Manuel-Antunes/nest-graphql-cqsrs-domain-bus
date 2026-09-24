'use client';

import * as React from 'react';

import {
  cleanupPolyfill,
  createRegistry,
  hasNativeModelContext,
  installPolyfill,
  setActiveRegistry,
} from './host';
import type {
  ModelContextAPI,
  RegistryInternal,
  WebMCPProviderProps,
  WebMCPStatus,
} from './types';

interface WebMCPContextValue {
  available: boolean;
  native: boolean;
  modelContext: ModelContextAPI | null;
  name: string;
  version: string;
  registry: RegistryInternal;
}

const MISSING_PROVIDER_REGISTRY = createRegistry();
const MISSING_PROVIDER: WebMCPContextValue = {
  available: false,
  native: false,
  modelContext: null,
  name: '',
  version: '',
  registry: MISSING_PROVIDER_REGISTRY,
};

export const WebMCPContext =
  React.createContext<WebMCPContextValue>(MISSING_PROVIDER);

let polyfillConsumerCount = 0;

export function _resetPolyfillConsumerCount(): void {
  polyfillConsumerCount = 0;
}

export function WebMCPProvider({
  name = '',
  version = '',
  forcePolyfill = false,
  children,
}: WebMCPProviderProps) {
  const registryRef = React.useRef<RegistryInternal | null>(null);
  if (registryRef.current === null) {
    registryRef.current = createRegistry();
  }
  const registry = registryRef.current;

  const [status, setStatus] = React.useState<{
    available: boolean;
    native: boolean;
    modelContext: ModelContextAPI | null;
  }>(() =>
    typeof document === 'undefined'
      ? { available: false, native: false, modelContext: null }
      : {
          available: !!document.modelContext,
          native: hasNativeModelContext(),
          modelContext: document.modelContext ?? null,
        },
  );

  const ownsPolyfillRef = React.useRef(false);

  React.useEffect(() => {
    setActiveRegistry(registry);

    const native = hasNativeModelContext();
    if (!native || forcePolyfill) {
      const installed = installPolyfill(registry, { force: forcePolyfill });
      if (installed) {
        ownsPolyfillRef.current = true;
        polyfillConsumerCount += 1;
      }
    }

    setStatus({
      available: typeof document !== 'undefined' && !!document.modelContext,
      native: hasNativeModelContext(),
      modelContext: document.modelContext ?? null,
    });

    return () => {
      if (ownsPolyfillRef.current) {
        polyfillConsumerCount -= 1;
        ownsPolyfillRef.current = false;
        if (polyfillConsumerCount <= 0) {
          polyfillConsumerCount = 0;
          cleanupPolyfill();
        }
      }
      setActiveRegistry(null);
    };
  }, [registry, forcePolyfill]);

  const value = React.useMemo<WebMCPContextValue>(
    () => ({
      available: status.available,
      native: status.native,
      modelContext: status.modelContext,
      name,
      version,
      registry,
    }),
    [
      status.available,
      status.native,
      status.modelContext,
      name,
      version,
      registry,
    ],
  );

  return (
    <WebMCPContext.Provider value={value}>{children}</WebMCPContext.Provider>
  );
}

export function useWebMCPStatus(): WebMCPStatus {
  const ctx = React.useContext(WebMCPContext);
  return { available: ctx.available, native: ctx.native };
}

export function useModelContext(): ModelContextAPI | null {
  return (typeof document !== 'undefined' && document.modelContext) || null;
}
