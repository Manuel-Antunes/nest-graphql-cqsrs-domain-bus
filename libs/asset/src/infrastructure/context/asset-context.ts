import { AsyncLocalStorage } from 'node:async_hooks';

import type { AssetContextData } from '../../domain/context/asset-context-registry';
import { AssetContextRegistry } from '../../domain/context/asset-context-registry';

const storage = new AsyncLocalStorage<AssetContextData>();
let globals: AssetContextData = {};

/**
 * The ambient context attachment strategies read, in two layers: process-wide **globals** set once
 * at boot, and a request or job **scope** opened with {@link AssetContext.run} and visible to every
 * async continuation inside it. The scope overlays the globals.
 *
 * Importing this module installs it as the domain's {@link AssetContextRegistry} reader.
 */
export const AssetContext = {
  /** Merges process-wide defaults. */
  setGlobals(values: AssetContextData): void {
    globals = { ...globals, ...values };
  },

  clearGlobals(): void {
    globals = {};
  },

  /** Runs `callback` with `values` layered over the scope already open, if any. */
  run<T>(values: AssetContextData, callback: () => T): T {
    return storage.run({ ...storage.getStore(), ...values }, callback);
  },

  /** Merges into the current scope; does nothing outside one. */
  set(values: AssetContextData): void {
    const scope = storage.getStore();
    if (scope) Object.assign(scope, values);
  },

  /** The globals overlaid with the current scope. */
  get(): AssetContextData {
    return { ...globals, ...storage.getStore() };
  },

  isActive(): boolean {
    return storage.getStore() !== undefined;
  },
};

AssetContextRegistry.use(() => AssetContext.get());
