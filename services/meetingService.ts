import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { cryptoService } from './cryptoService';
import { MeetingMinutes, DriveLinks } from '../types';

const MEETINGS_COLLECTION = 'meetings';

/**
 * Giải mã document đã mã hoá về đúng shape cũ để UI dùng như thường.
 * Không có khoá / sai khoá → trả về bản "locked" để history hiển thị 🔒.
 */
async function decryptMeetingDoc(id: string, data: any): Promise<any> {
  if (!data.encrypted) return { id, ...data };
  try {
    // Bản nháp chưa có biên bản → minutesEnc không tồn tại
    const minutes = data.minutesEnc ? JSON.parse(await cryptoService.decryptString(data.minutesEnc)) : null;
    const transcriptText = await cryptoService.decryptString(data.transcriptEnc || '');
    const translatedTranscript = await cryptoService.decryptString(data.translatedEnc || '');
    const { minutesEnc, transcriptEnc, translatedEnc, ...rest } = data;
    return { id, ...rest, minutes, transcriptText, translatedTranscript };
  } catch {
    return {
      id,
      locked: true,
      encrypted: true,
      createdAt: data.createdAt,
      driveLinks: data.driveLinks,
    };
  }
}

export const meetingService = {
  async saveMeeting(
    userUid: string,
    userEmail: string,
    minutes: MeetingMinutes,
    transcriptText: string,
    translatedTranscript: string,
    transcriptSource: 'hq' | 'live' = 'hq'
  ): Promise<string> {
    const base = {
      ownerUid: userUid,
      ownerEmail: userEmail,
      transcriptSource,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // E2EE bật → chỉ ciphertext rời trình duyệt
    const payload = (cryptoService.isEnabled() && await cryptoService.hasKey())
      ? {
          ...base,
          encrypted: true,
          minutesEnc: await cryptoService.encryptString(JSON.stringify(minutes)),
          transcriptEnc: await cryptoService.encryptString(transcriptText || ''),
          translatedEnc: await cryptoService.encryptString(translatedTranscript || ''),
        }
      : { ...base, minutes, transcriptText, translatedTranscript };

    const docRef = await addDoc(collection(db, MEETINGS_COLLECTION), payload);
    return docRef.id;
  },

  /**
   * Lưu NHÁP khi bước tạo biên bản thất bại: transcript được bảo toàn bền vững,
   * biên bản tạo lại sau bằng finalizeDraft (từ chính phiên này hoặc từ lịch sử).
   */
  async saveDraft(
    userUid: string,
    userEmail: string,
    transcriptText: string,
    translatedTranscript: string,
    transcriptSource: 'hq' | 'live' = 'hq'
  ): Promise<string> {
    const base = {
      ownerUid: userUid,
      ownerEmail: userEmail,
      draft: true,
      transcriptSource,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const payload = (cryptoService.isEnabled() && await cryptoService.hasKey())
      ? {
          ...base,
          encrypted: true,
          transcriptEnc: await cryptoService.encryptString(transcriptText || ''),
          translatedEnc: await cryptoService.encryptString(translatedTranscript || ''),
        }
      : { ...base, transcriptText, translatedTranscript };
    const docRef = await addDoc(collection(db, MEETINGS_COLLECTION), payload);
    return docRef.id;
  },

  /** Gắn biên bản vào bản nháp và bỏ cờ draft. */
  async finalizeDraft(
    meetingId: string,
    minutes: MeetingMinutes,
    translatedTranscript: string,
    encrypted: boolean = false
  ): Promise<void> {
    const patch: any = { draft: false, updatedAt: serverTimestamp() };
    if (encrypted && cryptoService.isEnabled() && await cryptoService.hasKey()) {
      patch.minutesEnc = await cryptoService.encryptString(JSON.stringify(minutes));
      patch.translatedEnc = await cryptoService.encryptString(translatedTranscript || '');
    } else {
      patch.minutes = minutes;
      patch.translatedTranscript = translatedTranscript || '';
    }
    await updateDoc(doc(db, MEETINGS_COLLECTION, meetingId), patch);
  },

  async getUserMeetings(userUid: string, options?: {
    pageSize?: number;
    startAfterDoc?: QueryDocumentSnapshot<DocumentData>;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ meetings: any[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    const pageSize = options?.pageSize ?? 10;
    const constraints: any[] = [
      where('ownerUid', '==', userUid),
    ];

    if (options?.startDate) {
      constraints.push(where('createdAt', '>=', Timestamp.fromDate(options.startDate)));
    }
    if (options?.endDate) {
      constraints.push(where('createdAt', '<=', Timestamp.fromDate(options.endDate)));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    if (options?.startAfterDoc) {
      constraints.push(startAfter(options.startAfterDoc));
    }

    constraints.push(limit(pageSize + 1));

    const q = query(collection(db, MEETINGS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      meetings: await Promise.all(docs.map(d => decryptMeetingDoc(d.id, d.data()))),
      lastDoc,
      hasMore,
    };
  },

  async deleteMeeting(meetingId: string): Promise<void> {
    await deleteDoc(doc(db, MEETINGS_COLLECTION, meetingId));
  },

  async deleteAllMeetings(userUid: string): Promise<void> {
    const q = query(
      collection(db, MEETINGS_COLLECTION),
      where('ownerUid', '==', userUid)
    );
    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
  },

  async updateMinutes(meetingId: string, minutes: MeetingMinutes, encrypted: boolean = false): Promise<void> {
    const docRef = doc(db, MEETINGS_COLLECTION, meetingId);
    // Doc đã mã hoá thì PHẢI ghi tiếp dạng mã hoá miễn còn khoá — KHÔNG phụ thuộc cờ
    // isEnabled() hiện tại (user có thể đã tắt E2EE nhưng doc cũ vẫn encrypted).
    // Ghi plaintext lên doc encrypted = mất dữ liệu (khi đọc chỉ giải mã minutesEnc).
    if (encrypted) {
      if (!await cryptoService.hasKey()) throw new Error('Missing E2EE key: cannot update encrypted meeting');
      await updateDoc(docRef, {
        minutesEnc: await cryptoService.encryptString(JSON.stringify(minutes)),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    // JSON round-trip loại bỏ mọi `undefined` — Firestore updateDoc reject nếu gặp undefined.
    await updateDoc(docRef, {
      minutes: JSON.parse(JSON.stringify(minutes)),
      updatedAt: serverTimestamp(),
    });
  },

  /** Cập nhật riêng bản dịch transcript (E2EE-aware) — dùng khi đổi tên speaker. */
  async updateTranslated(meetingId: string, translatedTranscript: string, encrypted: boolean = false): Promise<void> {
    const patch: any = { updatedAt: serverTimestamp() };
    if (encrypted) {
      if (!await cryptoService.hasKey()) throw new Error('Missing E2EE key: cannot update encrypted meeting');
      patch.translatedEnc = await cryptoService.encryptString(translatedTranscript || '');
    } else {
      patch.translatedTranscript = translatedTranscript || '';
    }
    await updateDoc(doc(db, MEETINGS_COLLECTION, meetingId), patch);
  },

  /** Thay transcript bằng bản gỡ băng HQ mới (E2EE-aware), đánh dấu nguồn 'hq'. */
  async updateTranscript(meetingId: string, transcriptText: string, encrypted: boolean = false): Promise<void> {
    const patch: any = { transcriptSource: 'hq', updatedAt: serverTimestamp() };
    if (encrypted) {
      if (!await cryptoService.hasKey()) throw new Error('Missing E2EE key: cannot update encrypted meeting');
      patch.transcriptEnc = await cryptoService.encryptString(transcriptText || '');
    } else {
      patch.transcriptText = transcriptText;
    }
    await updateDoc(doc(db, MEETINGS_COLLECTION, meetingId), patch);
  },

  async updateDriveLinks(meetingId: string, driveLinks: DriveLinks): Promise<void> {
    const docRef = doc(db, MEETINGS_COLLECTION, meetingId);
    await updateDoc(docRef, {
      driveLinks,
      updatedAt: serverTimestamp(),
    });
  },
};
