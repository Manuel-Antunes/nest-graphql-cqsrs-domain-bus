import { LocalStorage } from './localStorage';

// Default cache expiry is 24 hours
const DEFAULT_EXPIRY = 24 * 60 * 60 * 1000;

export const getFromCache = (
  key: string,
  expiry: number = DEFAULT_EXPIRY
): unknown => {
  try {
    const cached = LocalStorage.get(key);
    if (!cached) return null;

    const { data, timestamp } = cached;
    const isExpired = Date.now() - timestamp > expiry;

    if (isExpired) {
      LocalStorage.remove(key);
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
};

export const setCache = (key: string, data: unknown): void => {
  try {
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    LocalStorage.set(key, cacheData);
  } catch (error) {
    // Ignore cache errors
  }
};

export const clearCache = (key: string): void => {
  try {
    LocalStorage.remove(key);
  } catch (error) {
    // Ignore cache errors
  }
};
