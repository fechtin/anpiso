import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { cryptoService } from './cryptoService';
import { meetingService } from './meetingService';
import { MeetingMinutes } from '../types';

const SHARES_COLLECTION = 'shares';

/**
 * Chia sẻ một cuộc họp cho đồng nghiệp.
 *
 * Doc `shares/{id}` chỉ chứa **ciphertext** — được mã hoá bằng khoá riêng của
 * chính link đó, và khoá đó chỉ nằm sau dấu `#` trong URL (fragment không bao
 * giờ được trình duyệt gửi lên server). Nên kể cả khi rules bị nới hay ai đó
 * đọc được database, nội dung vẫn không giải mã nổi.
 *
 * Hai lớp độc lập: đọc được doc cần đúng email trong `allowedEmails` (rules),
 * giải mã được nội dung cần đúng link.
 */

/** Bản chụp nội dung cuộc họp tại thời điểm chia sẻ. */
export interface SharePayload {
  title: string;
  timeRange: string;
  minutes: MeetingMinutes | null;
  transcriptText: string;
  translatedTranscript: string;
  audio: { fileId: string; webViewLink: string } | null;
}

export interface ShareDoc {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  meetingId: string;
  allowedEmails: string[];
  includeAudio: boolean;
  audioFileId: string | null;
  payloadEnc: string;
  /** Khoá của link, bọc bằng khoá chủ — để chủ sở hữu cập nhật lại snapshot. */
  keyWrapped: string;
  createdAt?: any;
  updatedAt?: any;
}

const normalizeEmails = (emails: string[]): string[] =>
  Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)));

export const shareService = {
  normalizeEmails,

  /** Tạo link mới. Trả về `keyRaw` để ghép vào fragment — KHÔNG lưu ở đâu dạng thô. */
  async createShare(params: {
    ownerUid: string;
    ownerEmail: string;
    ownerName: string;
    meetingId: string;
    allowedEmails: string[];
    includeAudio: boolean;
    payload: SharePayload;
  }): Promise<{ shareId: string; keyRaw: string }> {
    const { key, raw } = await cryptoService.createShareKey();
    const docRef = await addDoc(collection(db, SHARES_COLLECTION), {
      ownerUid: params.ownerUid,
      ownerEmail: params.ownerEmail,
      ownerName: params.ownerName,
      meetingId: params.meetingId,
      allowedEmails: normalizeEmails(params.allowedEmails),
      includeAudio: params.includeAudio,
      audioFileId: params.payload.audio?.fileId || null,
      payloadEnc: await cryptoService.encryptWithKey(key, JSON.stringify(params.payload)),
      keyWrapped: await cryptoService.wrapShareKey(raw),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Ghi ngược id lên meeting doc: tra cứu bằng getDoc, khỏi cần composite index
    await meetingService.setShareId(params.meetingId, docRef.id);
    return { shareId: docRef.id, keyRaw: raw };
  },

  async getShare(shareId: string): Promise<ShareDoc | null> {
    const snapshot = await getDoc(doc(db, SHARES_COLLECTION, shareId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<ShareDoc, 'id'>) };
  },

  /** Đổi danh sách email được xem. Không đụng tới nội dung hay khoá. */
  async updateAccess(shareId: string, allowedEmails: string[], includeAudio: boolean, audioFileId: string | null): Promise<void> {
    await updateDoc(doc(db, SHARES_COLLECTION, shareId), {
      allowedEmails: normalizeEmails(allowedEmails),
      includeAudio,
      audioFileId,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Cập nhật snapshot khi chủ sở hữu sửa biên bản — link cũ vẫn sống vì mã hoá
   * lại đúng khoá cũ. Thiết bị chưa có khoá chủ sẽ ném NO_KEY, bên gọi tự xử lý.
   */
  async syncPayload(share: ShareDoc, payload: SharePayload): Promise<void> {
    const key = await cryptoService.unwrapShareKey(share.keyWrapped);
    await updateDoc(doc(db, SHARES_COLLECTION, share.id), {
      payloadEnc: await cryptoService.encryptWithKey(key, JSON.stringify(payload)),
      audioFileId: payload.audio?.fileId || null,
      updatedAt: serverTimestamp(),
    });
  },

  /** Giải mã nội dung bằng khoá lấy từ fragment URL. */
  async decryptPayload(share: ShareDoc, keyRaw: string): Promise<SharePayload> {
    const key = await cryptoService.importShareKey(keyRaw);
    return JSON.parse(await cryptoService.decryptWithKey(key, share.payloadEnc));
  },

  /** Thu hồi: xoá hẳn doc → link chết ngay. Quyền Drive gỡ riêng ở lớp trên. */
  async revokeShare(shareId: string, meetingId: string): Promise<void> {
    await deleteDoc(doc(db, SHARES_COLLECTION, shareId));
    await meetingService.setShareId(meetingId, null).catch(() => {});
  },

  /** Xoá cuộc họp thì link của nó phải chết theo — không để lại link mồ côi. */
  async deleteShare(shareId: string): Promise<void> {
    await deleteDoc(doc(db, SHARES_COLLECTION, shareId)).catch(() => {});
  },

  /** Dọn mọi link khi user xoá toàn bộ lịch sử. */
  async deleteAllShares(ownerUid: string): Promise<void> {
    const q = query(collection(db, SHARES_COLLECTION), where('ownerUid', '==', ownerUid));
    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref).catch(() => {})));
  },
};
