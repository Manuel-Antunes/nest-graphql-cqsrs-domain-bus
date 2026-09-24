const FIRED = new Set<string>();

function isDev(): boolean {
  try {
    const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
    if (g.process?.env?.NODE_ENV !== undefined) {
      return g.process.env.NODE_ENV !== 'production';
    }
  } catch {}
  return true;
}

export function warnOnce(key: string, message: string): void {
  if (!isDev()) return;
  if (FIRED.has(key)) return;
  FIRED.add(key);
  console.warn(`[WebMCP] ${message}`);
}

export function _resetWarnings(): void {
  FIRED.clear();
}
