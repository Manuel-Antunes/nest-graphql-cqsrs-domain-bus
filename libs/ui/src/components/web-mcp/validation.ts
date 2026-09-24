import type { WebMcpInputSchema } from './types';

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

export function isValidToolName(name: unknown): name is string {
  return typeof name === 'string' && TOOL_NAME_PATTERN.test(name);
}

export function isPotentiallyTrustworthyOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === 'file:') return true;
  if (url.origin !== origin) return false;
  if (url.protocol === 'https:' || url.protocol === 'wss:') return true;
  const host = url.hostname;
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1'
  );
}

const TYPE_CHECKERS: Record<string, (value: unknown) => boolean> = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && !Number.isNaN(v),
  integer: (v) => typeof v === 'number' && Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
};

export function validateArgs(
  args: Record<string, unknown>,
  schema: WebMcpInputSchema | undefined,
): void {
  if (!schema) return;

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (args[key] === undefined) {
      throw new DOMException(
        `Missing required field: "${key}"`,
        'OperationError',
      );
    }
  }

  const properties = schema.properties;
  if (!properties || typeof properties !== 'object') return;

  for (const key of Object.keys(args)) {
    const property = (properties as Record<string, unknown>)[key] as
      | { type?: string }
      | undefined;
    if (!property?.type) continue;
    const check = TYPE_CHECKERS[property.type];
    if (!check) continue;
    if (!check(args[key])) {
      throw new DOMException(
        `Invalid type for field "${key}": expected ${property.type}`,
        'OperationError',
      );
    }
  }
}

export function normalizeError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  if (
    typeof thrown === 'object' &&
    thrown !== null &&
    'name' in thrown &&
    typeof (thrown as { name: unknown }).name === 'string'
  ) {
    const source = thrown as { name: string; message?: unknown };
    const error = new Error(
      typeof source.message === 'string' ? source.message : String(thrown),
    );
    error.name = source.name;
    return error;
  }
  return new Error(String(thrown));
}

export function isDuplicateNameError(error: Error): boolean {
  return (
    error.name === 'InvalidStateError' ||
    /duplicate|already registered/i.test(error.message)
  );
}

export function isAbortError(error: Error): boolean {
  return error.name === 'AbortError';
}
