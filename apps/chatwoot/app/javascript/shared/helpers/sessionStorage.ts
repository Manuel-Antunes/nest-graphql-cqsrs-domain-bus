export default {
  clearAll(): void {
    window.sessionStorage.clear();
  },

  get(key: string): unknown {
    try {
      const value = window.sessionStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return window.sessionStorage.getItem(key);
    }
  },

  set(key: string, value: unknown): void {
    if (typeof value === 'object') {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } else {
      window.sessionStorage.setItem(key, value as string);
    }
  },

  remove(key: string): void {
    window.sessionStorage.removeItem(key);
  },
};
