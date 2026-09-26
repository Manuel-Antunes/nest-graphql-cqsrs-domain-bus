import { AsyncLocalStorage } from 'node:async_hooks';

import type { AttachmentContextData } from '../../domain/context/attachment-context-registry';
import { AttachmentContextRegistry } from '../../domain/context/attachment-context-registry';

const storage = new AsyncLocalStorage<AttachmentContextData>();
let globals: AttachmentContextData = {};

/**
 * The ambient context attachment strategies read, in two layers: process-wide **globals** set once
 * at boot, and a request or job **scope** opened with {@link AttachmentContext.run} and visible to
 * every async continuation inside it. The scope overlays the globals.
 *
 * Importing this module installs it as the domain's {@link AttachmentContextRegistry} reader.
 */
export const AttachmentContext = {
  /** Merges process-wide defaults. */
  setGlobals(values: AttachmentContextData): void {
    globals = { ...globals, ...values };
  },

  clearGlobals(): void {
    globals = {};
  },

  /** Runs `callback` with `values` layered over the scope already open, if any. */
  run<T>(values: AttachmentContextData, callback: () => T): T {
    return storage.run({ ...storage.getStore(), ...values }, callback);
  },

  /** Merges into the current scope; does nothing outside one. */
  set(values: AttachmentContextData): void {
    const scope = storage.getStore();
    if (scope) Object.assign(scope, values);
  },

  /** The globals overlaid with the current scope. */
  get(): AttachmentContextData {
    return { ...globals, ...storage.getStore() };
  },

  isActive(): boolean {
    return storage.getStore() !== undefined;
  },
};

AttachmentContextRegistry.use(() => AttachmentContext.get());
