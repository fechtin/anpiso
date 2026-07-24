
import { logService } from './logService';

const STORAGE_KEY = 'user_gemini_api_keys';
let currentKeyIndex = 0;

// Track key errors: keyIndex → error label
const keyErrors = new Map<number, string>();
let keyErrorVersion = 0;

function classifyKeyError(error: any): string {
  if (!error) return 'Lỗi không xác định';
  const msg = (error.message || error.toString() || '').toLowerCase();
  if (msg.includes('api_key_invalid') || msg.includes('invalid api key') || msg.includes('api key not valid'))
    return 'Key không hợp lệ';
  if (msg.includes('key expired') || msg.includes('key_expired') || msg.includes('api key expired'))
    return 'Key hết hạn';
  if (msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('429'))
    return 'Hết quota';
  if (msg.includes('permission_denied') || msg.includes('forbidden') || msg.includes('403'))
    return 'Không có quyền';
  if (msg.includes('billing_disabled') || msg.includes('billing not enabled'))
    return 'Chưa bật billing';
  if (msg.includes('api_not_enabled') || msg.includes('service not enabled'))
    return 'API chưa bật';
  if (msg.includes('unauthorized') || msg.includes('401'))
    return 'Không xác thực';
  if (msg.includes('account_disabled'))
    return 'Tài khoản bị khoá';
  if (msg.includes('project_invalid') || msg.includes('project not found'))
    return 'Project không hợp lệ';
  return 'Lỗi không xác định';
}

export const apiKeyService = {
  /** Get all user-provided keys */
  getKeys(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const keys = JSON.parse(raw);
      return Array.isArray(keys) ? keys.filter((k: string) => k.trim()) : [];
    } catch {
      return [];
    }
  },

  /** Save multiple keys */
  setKeys(keys: string[]) {
    const cleaned = keys.map(k => k.trim()).filter(Boolean);
    if (cleaned.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    currentKeyIndex = 0;
    keyErrors.clear();
    keyErrorVersion++;
  },

  /** Returns true if user has provided at least one key */
  hasUserKeys(): boolean {
    return this.getKeys().length > 0;
  },

  /** Clear all user keys */
  clearKeys() {
    localStorage.removeItem(STORAGE_KEY);
    currentKeyIndex = 0;
    keyErrors.clear();
    keyErrorVersion++;
  },

  /** Get the current active API key */
  getGeminiApiKey(): string {
    const keys = this.getKeys();
    // No shared/default key: each user must provide their own key. A build-time
    // env key would be baked into the client bundle and leaked to every visitor.
    if (keys.length === 0) return '';
    const idx = currentKeyIndex % keys.length;
    return keys[idx];
  },

  /** Get current key index (for UI display) */
  getCurrentIndex(): number {
    const keys = this.getKeys();
    if (keys.length === 0) return -1;
    return currentKeyIndex % keys.length;
  },

  /**
   * Rotate to the next key. Records the error for the current key.
   * Returns true if a different key is available.
   */
  rotateKey(error?: any): boolean {
    const keys = this.getKeys();
    const failedIndex = keys.length > 0 ? currentKeyIndex % keys.length : -1;

    // Record error for the failed key
    if (failedIndex >= 0 && error) {
      keyErrors.set(failedIndex, classifyKeyError(error));
      keyErrorVersion++;
    } else if (failedIndex >= 0) {
      keyErrors.set(failedIndex, 'Lỗi không xác định');
      keyErrorVersion++;
    }

    if (keys.length <= 1) return false;

    const prevIndex = currentKeyIndex % keys.length;
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    const masked = keys[currentKeyIndex].slice(0, 8) + '***';
    logService.add('text', 'info', 'key-rotate', `Key ${prevIndex + 1} unusable → chuyển sang key ${currentKeyIndex + 1} (${masked})`);
    return true;
  },

  /** Get error status for each key. Returns Map<index, errorLabel> */
  getKeyErrors(): Map<number, string> {
    return new Map(keyErrors);
  },

  /** Version counter that increments on every error change (for React reactivity) */
  getKeyErrorVersion(): number {
    return keyErrorVersion;
  },

  /** Clear error for a specific key index */
  clearKeyError(index: number) {
    keyErrors.delete(index);
    keyErrorVersion++;
  },

  /** Clear all key errors */
  clearAllKeyErrors() {
    keyErrors.clear();
    keyErrorVersion++;
  },

  /** Check if an error means the current key is unusable and we should rotate */
  shouldRotateKey(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || error.toString() || '').toLowerCase();
    const status = error.status || error.statusCode || error.code || 0;

    // HTTP status codes
    if ([429, 403, 401].includes(Number(status))) return true;

    // Google API error codes / messages
    const rotatePatterns = [
      'resource_exhausted',       // Quota exceeded
      'resource has been exhausted',
      'quota',
      '429',
      'api_key_invalid',          // Invalid API key
      'api key not valid',
      'api key expired',
      'permission_denied',        // Key lacks permission
      'forbidden',                // 403
      'billing_disabled',         // Billing not enabled
      'billing not enabled',
      'api_not_enabled',          // Gemini API not enabled for project
      'service not enabled',
      'unauthorized',             // 401
      'invalid_api_key',
      'invalid api key',
      'access_token_expired',
      'consumer_invalid',         // Invalid consumer/project
      'project_invalid',
      'project not found',
      'key_expired',
      'account_disabled',
    ];

    return rotatePatterns.some(p => msg.includes(p));
  },
};
