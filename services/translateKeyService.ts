const STORAGE_KEY = 'user_google_translate_api_key';

let lastError: string | null = null;
let errorVersion = 0;

export const translateKeyService = {
  getKey(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  },

  setKey(key: string) {
    const cleaned = key.trim();
    if (cleaned) {
      localStorage.setItem(STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    lastError = null;
    errorVersion++;
  },

  clearKey() {
    localStorage.removeItem(STORAGE_KEY);
    lastError = null;
    errorVersion++;
  },

  hasKey(): boolean {
    return !!this.getKey();
  },

  recordError(label: string) {
    lastError = label;
    errorVersion++;
  },

  clearError() {
    if (lastError !== null) {
      lastError = null;
      errorVersion++;
    }
  },

  getError(): string | null {
    return lastError;
  },

  getErrorVersion(): number {
    return errorVersion;
  },
};
