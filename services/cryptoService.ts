// Mã hoá đầu-cuối (E2EE) cho transcript/biên bản: AES-GCM 256 chạy hoàn toàn
// trên trình duyệt. Chìa khoá nằm trong IndexedDB của thiết bị — server không
// bao giờ thấy plaintext lẫn khoá. Backup khoá: file tải về hoặc Drive appDataFolder.

const DB_NAME = 'anpiso-crypto';
const STORE = 'keys';
const KEY_ID = 'e2ee';
const FLAG = 'pref_e2ee';
const PREFIX = 'enc1:'; // đánh dấu chuỗi đã mã hoá + version scheme

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as T);
    tx.onerror = () => reject(tx.error);
  }));
}

function idbPut(key: string, value: unknown): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

const b64encode = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const b64decode = (s: string): Uint8Array => {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

let cachedKey: CryptoKey | null = null;

export const cryptoService = {
  isEnabled(): boolean {
    return localStorage.getItem(FLAG) === 'on';
  },

  async getKey(): Promise<CryptoKey | null> {
    if (cachedKey) return cachedKey;
    cachedKey = (await idbGet<CryptoKey>(KEY_ID)) || null;
    return cachedKey;
  },

  async hasKey(): Promise<boolean> {
    return !!(await this.getKey());
  },

  /** Bật E2EE — sinh khoá mới nếu thiết bị chưa có (khoá cũ được giữ lại). */
  async enable(): Promise<void> {
    let key = await this.getKey();
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      await idbPut(KEY_ID, key);
      cachedKey = key;
    }
    localStorage.setItem(FLAG, 'on');
  },

  /** Tắt E2EE cho các bản lưu MỚI — giữ khoá để vẫn đọc được cuộc họp đã mã hoá. */
  disable(): void {
    localStorage.setItem(FLAG, 'off');
  },

  async exportKeyString(): Promise<string> {
    const key = await this.getKey();
    if (!key) throw new Error('NO_KEY');
    const raw = await crypto.subtle.exportKey('raw', key);
    return 'anpiso-e2ee-v1:' + b64encode(raw);
  },

  async importKeyString(s: string): Promise<void> {
    const trimmed = s.trim();
    if (!trimmed.startsWith('anpiso-e2ee-v1:')) throw new Error('INVALID_KEY');
    const raw = b64decode(trimmed.slice('anpiso-e2ee-v1:'.length));
    if (raw.length !== 32) throw new Error('INVALID_KEY');
    const key = await crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await idbPut(KEY_ID, key);
    cachedKey = key;
    localStorage.setItem(FLAG, 'on');
  },

  /** Vân tay khoá để user đối chiếu giữa các thiết bị. */
  async fingerprint(): Promise<string> {
    const key = await this.getKey();
    if (!key) return '';
    const raw = await crypto.subtle.exportKey('raw', key);
    const digest = await crypto.subtle.digest('SHA-256', raw);
    const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    return (hex.slice(0, 12).match(/.{4}/g) || []).join(' ').toUpperCase();
  },

  isEncrypted(v: unknown): v is string {
    return typeof v === 'string' && v.startsWith(PREFIX);
  },

  async encryptString(plain: string): Promise<string> {
    const key = await this.getKey();
    if (!key) throw new Error('NO_KEY');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    return PREFIX + b64encode(iv.buffer as ArrayBuffer) + '.' + b64encode(ct);
  },

  async decryptString(payload: string): Promise<string> {
    if (!this.isEncrypted(payload)) return payload;
    const key = await this.getKey();
    if (!key) throw new Error('NO_KEY');
    const [ivB64, ctB64] = payload.slice(PREFIX.length).split('.');
    const iv = b64decode(ivB64);
    const ct = b64decode(ctB64);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, ct.buffer as ArrayBuffer);
    return new TextDecoder().decode(plain);
  },
};
