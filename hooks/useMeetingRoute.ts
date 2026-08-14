import { useCallback, useEffect, useRef } from 'react';
import { meetingService } from '../services/meetingService';

/**
 * Gắn chi tiết cuộc họp vào URL `/m/<id>` bằng History API — không thêm thư viện
 * router. Nhờ vậy nút Back/Forward của trình duyệt hoạt động, và link cuộc họp
 * bookmark/refresh được (dữ liệu vẫn phải đăng nhập + có khoá E2EE mới đọc nổi).
 */

/** Prefix của trang tĩnh đa ngôn ngữ (/en, /ko) — giữ nguyên khi đổi URL. */
const LOCALE_PREFIX = (() => {
  const m = window.location.pathname.match(/^\/(en|ko)(?=\/|$)/);
  return m ? m[0] : '';
})();

const HOME_URL = `${LOCALE_PREFIX}/`;
const meetingUrl = (id: string) => `${LOCALE_PREFIX}/m/${id}`;

/** Đọc id cuộc họp từ URL hiện tại, bỏ qua prefix locale. */
const meetingIdFromUrl = (): string | null => {
  const path = window.location.pathname.slice(LOCALE_PREFIX.length);
  const m = path.match(/^\/m\/([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1] : null;
};

interface Options {
  userUid?: string;
  /** Các cuộc họp đã tải sẵn — tránh gọi Firestore lại khi Back/Forward. */
  meetings: any[];
  onOpen: (meeting: any) => void;
  onClose: () => void;
}

export const useMeetingRoute = ({ userUid, meetings, onOpen, onClose }: Options) => {
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const restoredRef = useRef(false);

  /** Ưu tiên danh sách đã tải; chưa có thì lấy thẳng doc từ Firestore. */
  const loadMeeting = useCallback(async (id: string) => {
    const cached = meetingsRef.current.find(m => m.id === id);
    if (cached) return cached;
    if (!userUid) return null;
    return meetingService.getMeetingById(id, userUid);
  }, [userUid]);

  /** URL không còn trỏ tới cuộc họp nào → về danh sách. */
  const backToList = useCallback((rewriteUrl: boolean) => {
    onCloseRef.current();
    if (rewriteUrl) window.history.replaceState({}, '', HOME_URL);
  }, []);

  // Back/Forward của trình duyệt → đồng bộ view theo URL
  useEffect(() => {
    const onPop = async () => {
      const id = meetingIdFromUrl();
      if (!id) {
        backToList(false);
        return;
      }
      try {
        const meeting = await loadMeeting(id);
        if (meeting) onOpenRef.current(meeting);
        else backToList(true);
      } catch {
        backToList(true);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [loadMeeting, backToList]);

  // Vào thẳng /m/<id> (bookmark, refresh, F5) → mở đúng cuộc họp sau khi đăng nhập
  useEffect(() => {
    if (!userUid || restoredRef.current) return;
    const id = meetingIdFromUrl();
    if (!id) return;
    restoredRef.current = true;
    let alive = true;
    loadMeeting(id)
      .then(meeting => {
        if (!alive) return;
        if (meeting) onOpenRef.current(meeting);
        else backToList(true);
      })
      .catch(() => { if (alive) backToList(true); });
    return () => { alive = false; };
  }, [userUid, loadMeeting, backToList]);

  const openMeeting = useCallback((meeting: any) => {
    onOpenRef.current(meeting);
    if (meetingIdFromUrl() !== meeting.id) {
      window.history.pushState({ meetingId: meeting.id }, '', meetingUrl(meeting.id));
    }
  }, []);

  const closeMeeting = useCallback(() => {
    // Entry do chính app đẩy vào → lùi lại để lịch sử không phình thêm một bước.
    // Vào thẳng bằng link (không có entry nào phía trước) → chỉ viết lại URL.
    if (window.history.state?.meetingId) window.history.back();
    else backToList(true);
  }, [backToList]);

  return { openMeeting, closeMeeting };
};
