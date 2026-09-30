export const LocalStorage = {
  clearAll(): void {
    window.localStorage.clear();
  },

  get(key: string): any {
    let value: string | null = null;
    try {
      value = window.localStorage.getItem(key);
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (error) {
      return value;
    }
  },

  set(key: string, value: unknown): void {
    if (typeof value === 'object') {
      window.localStorage.setItem(key, JSON.stringify(value));
    } else {
      window.localStorage.setItem(key, value as string);
    }
    window.localStorage.setItem(key + ':ts', Date.now().toString());
  },

  setFlag(
    store: string,
    accountId: string | number | null | undefined,
    key: string,
    expiry: number = 24 * 60 * 60 * 1000
  ): void {
    const storeName = accountId ? `${store}::${accountId}` : store;

    const rawValue = window.localStorage.getItem(storeName);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};

    parsedValue[key] = Date.now() + expiry;

    window.localStorage.setItem(storeName, JSON.stringify(parsedValue));
  },

  getFlag(
    store: string,
    accountId: string | number | null | undefined,
    key: string
  ): boolean {
    const storeName = store ? `${store}::${accountId}` : store;

    const rawValue = window.localStorage.getItem(storeName);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};

    return parsedValue[key] && parsedValue[key] > Date.now();
  },

  remove(key: string): void {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(key + ':ts');
  },

  updateJsonStore(storeName: string, key: string, value: unknown): void {
    try {
      const storedValue = this.get(storeName) || {};
      storedValue[key] = value;
      this.set(storeName, storedValue);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error updating JSON store in localStorage', e);
    }
  },

  getFromJsonStore(storeName: string, key: string): any {
    try {
      const storedValue = this.get(storeName) || {};
      return storedValue[key] || null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error getting value from JSON store in localStorage', e);
      return null;
    }
  },

  deleteFromJsonStore(storeName: string, key: string): void {
    try {
      const storedValue = this.get(storeName);
      if (storedValue && key in storedValue) {
        delete storedValue[key];
        this.set(storeName, storedValue);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error deleting entry from JSON store in localStorage', e);
    }
  },
};
