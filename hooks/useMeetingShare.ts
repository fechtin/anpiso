import { useCallback, useState } from 'react';
import { User } from '../types';
import { shareService, ShareDoc, SharePayload } from '../services/shareService';
import { cryptoService } from '../services/cryptoService';
import { driveService } from '../services/driveService';
import { getDriveToken } from '../utils/driveToken';

/**
 * Điều phối link chia sẻ cuộc họp: tạo / đổi quyền / thu hồi, và đồng bộ lại
 * snapshot khi chủ sở hữu sửa biên bản. Giữ ngoài App.tsx cho gọn.
 */

/** Bản chụp gửi cho người được chia sẻ — chỉ dữ liệu hiển thị, không kèm gì khác. */
const buildPayload = (meeting: any, includeAudio: boolean): SharePayload => ({
  title: meeting.minutes?.shortSummary || '',
  timeRange: meeting.minutes?.time || '',
  minutes: meeting.minutes || null,
  transcriptText: meeting.transcriptText || '',
  translatedTranscript: meeting.translatedTranscript || '',
  audio: includeAudio && meeting.driveLinks?.audioFileId
    ? { fileId: meeting.driveLinks.audioFileId, webViewLink: meeting.driveLinks.audioWebViewLink || '' }
    : null,
});

interface Options {
  user: User | null;
  meeting: any | null;
  /** Ghi ngược shareId lên state cuộc họp đang mở. */
  onShareIdChange: (shareId: string | null) => void;
}

export const useMeetingShare = ({ user, meeting, onShareIdChange }: Options) => {
  const [isOpen, setIsOpen] = useState(false);
  const [share, setShare] = useState<ShareDoc | null>(null);
  const [keyRaw, setKeyRaw] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const hasAudio = !!meeting?.driveLinks?.audioFileId;

  /**
   * Cấp/gỡ quyền đọc file audio trên Drive theo đúng phần chênh lệch.
   * CHỈ đụng vào email do app cấp — quyền user tự chia sẻ ngoài Drive phải giữ nguyên.
   */
  const syncDrivePermissions = async (
    fileId: string,
    prevEmails: string[],
    nextEmails: string[],
    includeAudio: boolean,
  ) => {
    const token = await getDriveToken();
    const next = includeAudio ? shareService.normalizeEmails(nextEmails) : [];
    const prev = shareService.normalizeEmails(prevEmails);
    const removed = prev.filter(e => !next.includes(e));
    const added = next.filter(e => !prev.includes(e));
    if (removed.length > 0) await driveService.revokeReaders(token, fileId, removed);
    if (added.length > 0) await driveService.grantReaders(token, fileId, added);
  };

  const open = useCallback(async () => {
    setErrorMsg('');
    setShare(null);
    setKeyRaw(null);
    setIsOpen(true);
    if (!meeting?.shareId) return;

    try {
      const existing = await shareService.getShare(meeting.shareId);
      if (!existing) { onShareIdChange(null); return; }
      setShare(existing);
      // Thiết bị này chưa có khoá chủ → không dựng lại được link cũ, dialog sẽ cảnh báo
      try {
        setKeyRaw(await cryptoService.unwrapShareKeyRaw(existing.keyWrapped));
      } catch {
        setKeyRaw(null);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    }
  }, [meeting?.shareId, onShareIdChange]);

  const close = useCallback(() => setIsOpen(false), []);

  const create = useCallback(async (emails: string[], includeAudio: boolean) => {
    if (!user || !meeting) return;
    setIsBusy(true);
    setErrorMsg('');
    try {
      const { shareId, keyRaw: raw } = await shareService.createShare({
        ownerUid: user.uid,
        ownerEmail: user.email,
        ownerName: user.name || user.email,
        meetingId: meeting.id,
        allowedEmails: emails,
        includeAudio,
        payload: buildPayload(meeting, includeAudio),
      });
      onShareIdChange(shareId);
      setShare(await shareService.getShare(shareId));
      setKeyRaw(raw);

      if (includeAudio && meeting.driveLinks?.audioFileId) {
        try {
          await syncDrivePermissions(meeting.driveLinks.audioFileId, [], emails, true);
        } catch (err) {
          console.error('Drive permission failed:', err);
          setErrorMsg('DRIVE_FAILED');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsBusy(false);
    }
  }, [user, meeting, onShareIdChange]);

  const update = useCallback(async (emails: string[], includeAudio: boolean) => {
    if (!share || !meeting) return;
    setIsBusy(true);
    setErrorMsg('');
    try {
      const audioFileId = includeAudio ? (meeting.driveLinks?.audioFileId || null) : null;
      await shareService.updateAccess(share.id, emails, includeAudio, audioFileId);
      setShare({ ...share, allowedEmails: shareService.normalizeEmails(emails), includeAudio, audioFileId });

      // Bật/tắt audio đổi cả nội dung snapshot → mã hoá lại nếu mở được khoá
      if (share.includeAudio !== includeAudio) {
        await shareService.syncPayload(share, buildPayload(meeting, includeAudio)).catch(() => {});
      }
      if (meeting.driveLinks?.audioFileId) {
        try {
          await syncDrivePermissions(meeting.driveLinks.audioFileId, share.allowedEmails, emails, includeAudio);
        } catch (err) {
          console.error('Drive permission failed:', err);
          setErrorMsg('DRIVE_FAILED');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsBusy(false);
    }
  }, [share, meeting]);

  const revoke = useCallback(async () => {
    if (!share || !meeting) return;
    setIsBusy(true);
    setErrorMsg('');
    try {
      if (share.audioFileId) {
        try {
          await driveService.revokeReaders(await getDriveToken(), share.audioFileId, share.allowedEmails);
        } catch (err) {
          console.error('Drive revoke failed:', err);
        }
      }
      await shareService.revokeShare(share.id, meeting.id);
      onShareIdChange(null);
      setShare(null);
      setKeyRaw(null);
      setIsOpen(false);
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsBusy(false);
    }
  }, [share, meeting, onShareIdChange]);

  /**
   * Chủ sở hữu sửa biên bản/đổi tên speaker → cập nhật snapshot để link không cũ.
   * Best-effort: thiếu khoá chủ thì bỏ qua, dialog sẽ cảnh báo khi mở.
   */
  const syncPayload = useCallback(async (updatedMeeting: any) => {
    if (!updatedMeeting?.shareId) return;
    try {
      const existing = await shareService.getShare(updatedMeeting.shareId);
      if (!existing) return;
      await shareService.syncPayload(existing, buildPayload(updatedMeeting, existing.includeAudio));
    } catch (err) {
      console.warn('Share snapshot not synced:', err);
    }
  }, []);

  return { isOpen, share, keyRaw, isBusy, errorMsg, hasAudio, open, close, create, update, revoke, syncPayload };
};
