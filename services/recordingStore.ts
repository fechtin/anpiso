/**
 * Lưu bền vững từng chunk audio ngay khi MediaRecorder nhả ra.
 *
 * Vì sao cần: trước đây chunk chỉ nằm trong RAM (`audioChunksRef`). Trên điện thoại,
 * khi app bị đẩy xuống nền, OS có thể kill hẳn tab — mất TOÀN BỘ cuộc họp chứ không
 * phải vài giây cuối. IndexedDB giữ lại để mở app lần sau còn khôi phục được.
 *
 * Mọi hàm đều nuốt lỗi và trả về giá trị trung tính: ghi âm không bao giờ được hỏng
 * chỉ vì storage đầy / chế độ ẩn danh chặn IndexedDB.
 */

const DB_NAME = 'anpiso-recording';
const DB_VERSION = 1;
const CHUNKS = 'chunks';
const SESSIONS = 'sessions';

/** Bản ghi mồ côi quá hạn này thì tự dọn, tránh phình storage vô hạn. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface RecordingSessionMeta {
  id: string;
  startedAt: number;
  updatedAt: number;
  mimeType: string;
  chunkCount: number;
  bytes: number;
}

const isSupported = (): boolean => typeof indexedDB !== 'undefined';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SESSIONS)) {
          db.createObjectStore(SESSIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CHUNKS)) {
          const store = db.createObjectStore(CHUNKS, { keyPath: ['sessionId', 'seq'] });
          store.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(err => {
      dbPromise = null; // cho phép thử lại ở lần gọi sau
      throw err;
    });
  }
  return dbPromise;
};

const tx = <T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T> | T
): Promise<T> =>
  openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        let result: T;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        Promise.resolve(run(transaction)).then(
          r => { result = r; },
          err => { reject(err); try { transaction.abort(); } catch {} }
        );
      })
  );

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const recordingStore = {
  isSupported,

  /** Mở một phiên mới; trả về id để các chunk sau gắn vào, hoặc null nếu storage không dùng được. */
  async beginSession(mimeType: string): Promise<string | null> {
    if (!isSupported()) return null;
    const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const meta: RecordingSessionMeta = {
      id, startedAt: now, updatedAt: now, mimeType, chunkCount: 0, bytes: 0,
    };
    try {
      await tx(SESSIONS, 'readwrite', t => wrap(t.objectStore(SESSIONS).put(meta)));
      return id;
    } catch {
      return null;
    }
  },

  /** Ghi 1 chunk + cập nhật meta. Fire-and-forget từ phía recorder — không chặn luồng ghi. */
  async appendChunk(sessionId: string, seq: number, blob: Blob): Promise<void> {
    if (!isSupported()) return;
    try {
      await tx([CHUNKS, SESSIONS], 'readwrite', async t => {
        await wrap(t.objectStore(CHUNKS).put({ sessionId, seq, blob }));
        const store = t.objectStore(SESSIONS);
        const meta = await wrap(store.get(sessionId) as IDBRequest<RecordingSessionMeta | undefined>);
        if (meta) {
          meta.chunkCount = Math.max(meta.chunkCount, seq + 1);
          meta.bytes += blob.size;
          meta.updatedAt = Date.now();
          await wrap(store.put(meta));
        }
      });
    } catch {
      // Storage đầy hoặc bị chặn — bản sao RAM vẫn còn, cứ ghi âm tiếp
    }
  },

  /**
   * Mọi phiên còn trong store, mới nhất trước — kể cả phiên rỗng (0 byte) để `pruneOld`
   * dọn được. Phiên đang ghi dở của tab hiện tại và phiên rỗng do caller tự loại.
   */
  async listSessions(): Promise<RecordingSessionMeta[]> {
    if (!isSupported()) return [];
    try {
      const all = await tx(SESSIONS, 'readonly', t =>
        wrap(t.objectStore(SESSIONS).getAll() as IDBRequest<RecordingSessionMeta[]>)
      );
      return all.sort((a, b) => b.startedAt - a.startedAt);
    } catch {
      return [];
    }
  },

  /** Ghép lại thành file audio hoàn chỉnh theo đúng thứ tự chunk. */
  async assembleBlob(sessionId: string, mimeType: string): Promise<Blob | null> {
    if (!isSupported()) return null;
    try {
      const rows = await tx(CHUNKS, 'readonly', t =>
        wrap(t.objectStore(CHUNKS).index('sessionId').getAll(sessionId) as IDBRequest<
          { sessionId: string; seq: number; blob: Blob }[]
        >)
      );
      if (!rows.length) return null;
      rows.sort((a, b) => a.seq - b.seq);
      return new Blob(rows.map(r => r.blob), { type: mimeType });
    } catch {
      return null;
    }
  },

  async discardSession(sessionId: string): Promise<void> {
    if (!isSupported() || !sessionId) return;
    try {
      await tx([CHUNKS, SESSIONS], 'readwrite', async t => {
        const keys = await wrap(
          t.objectStore(CHUNKS).index('sessionId').getAllKeys(sessionId) as IDBRequest<IDBValidKey[]>
        );
        const chunks = t.objectStore(CHUNKS);
        keys.forEach(k => chunks.delete(k));
        await wrap(t.objectStore(SESSIONS).delete(sessionId));
      });
    } catch {
      // Không xoá được thì lần mở app sau banner khôi phục sẽ hiện lại — chấp nhận được
    }
  },

  /** Dọn phiên quá hạn. Gọi lúc mở app, không cần chờ kết quả. */
  async pruneOld(): Promise<void> {
    const cutoff = Date.now() - MAX_AGE_MS;
    const sessions = await this.listSessions();
    for (const s of sessions) {
      if (s.updatedAt < cutoff) await this.discardSession(s.id);
    }
  },
};
