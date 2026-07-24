import { MeetingMinutes } from '../types';

/**
 * Đổi tên "speaker" (vd "Speaker 1") thành tên/chức danh cụ thể trên TOÀN BỘ biên bản.
 *
 * "Speaker N" không phải entity riêng — nó chỉ là chuỗi text được AI nhét vào nhiều
 * field (participants, action items, thảo luận, transcript...). Nên đổi tên = thay thế
 * token đó ở mọi nơi. Chỉ đổi phần định danh, GIỮ nguyên phần chức danh trong ngoặc:
 *   "Speaker 1 (Cố vấn ERP)"  --("Speaker 1" → "Anh Nam")-->  "Anh Nam (Cố vấn ERP)"
 */

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Phần định danh của một participant: chuỗi trước " (" (chức danh), hoặc cả chuỗi. */
export const speakerToken = (participant: string): string => {
  const i = participant.indexOf(' (');
  return (i >= 0 ? participant.slice(0, i) : participant).trim();
};

/** Thay mọi lần xuất hiện của `token` trong `text` bằng `to`. */
export const replaceSpeakerInText = (text: string, token: string, to: string): string => {
  if (!text || !token || token === to) return text;
  // "Speaker 1" không được ăn nhầm "Speaker 10" → chặn nếu ngay sau là chữ số.
  // Không dùng \b vì token có thể là tên tiếng Việt (không phải ký tự ASCII word).
  const guard = /^Speaker \d+$/.test(token) ? '(?!\\d)' : '';
  return text.replace(new RegExp(escapeRegExp(token) + guard, 'g'), to);
};

/**
 * Áp dụng đổi tên lên mọi field text của biên bản, trả về object mới (immutable).
 * QUAN TRỌNG: KHÔNG chèn key `undefined` cho các field optional vắng mặt —
 * Firestore updateDoc ném lỗi khi gặp `undefined` → cả lệnh ghi bị reject.
 * `...m` đã copy đúng các key hiện có; chỉ override field optional khi nó tồn tại.
 */
export const renameSpeakerInMinutes = (
  m: MeetingMinutes,
  token: string,
  to: string
): MeetingMinutes => {
  const r = (s: string): string => replaceSpeakerInText(s, token, to);
  const out: MeetingMinutes = {
    ...m,
    participants: m.participants.map(r),
    shortSummary: r(m.shortSummary),
    actionItems: m.actionItems.map(a => ({ ...a, task: r(a.task), pic: r(a.pic) })),
    translatedTranscript: r(m.translatedTranscript || ''),
  };
  if (m.purpose != null) out.purpose = r(m.purpose);
  if (m.summary != null) out.summary = r(m.summary);
  if (m.discussion) out.discussion = m.discussion.map(d => ({ topic: r(d.topic), content: r(d.content) }));
  if (m.decisions) out.decisions = m.decisions.map(r);
  if (m.openIssues) out.openIssues = m.openIssues.map(r);
  return out;
};
