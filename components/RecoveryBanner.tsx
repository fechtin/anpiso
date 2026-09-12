import React, { useEffect, useState } from 'react';
import { recordingStore, RecordingSessionMeta } from '../services/recordingStore';
import { useLocale } from '../i18n';

interface Props {
  /** Khoá phiên đang ghi dở của chính tab này — nó chưa mồ côi. */
  activeSessionId?: string | null;
  /** Gỡ băng + tạo biên bản từ file khôi phục. Ném lỗi thì banner hiện lỗi và giữ nguyên dữ liệu. */
  onRecover: (blob: Blob, startedAt: Date) => Promise<void>;
  disabled?: boolean;
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Bản ghi mồ côi = phiên có audio trong IndexedDB nhưng chưa bao giờ ra được biên bản
 * (OS kill tab lúc chạy nền, tắt máy, crash). Không có banner này thì dữ liệu nằm đó
 * vô hình và người dùng tin là đã mất cuộc họp.
 */
const RecoveryBanner: React.FC<Props> = ({ activeSessionId, onRecover, disabled }) => {
  const { t } = useLocale();
  const [sessions, setSessions] = useState<RecordingSessionMeta[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    recordingStore.pruneOld()
      .then(() => recordingStore.listSessions())
      .then(all => {
        if (!cancelled) setSessions(all.filter(s => s.bytes > 0 && s.id !== activeSessionId));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeSessionId]);

  const visible = sessions.filter(s => s.id !== activeSessionId);
  if (visible.length === 0) return null;

  const forget = async (id: string) => {
    await recordingStore.discardSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const download = async (s: RecordingSessionMeta) => {
    setBusyId(s.id);
    setError(null);
    try {
      const blob = await recordingStore.assembleBlob(s.id, s.mimeType);
      if (!blob) throw new Error(t.recoveryEmpty);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anpiso-${new Date(s.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${s.mimeType.includes('mp4') ? 'm4a' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusyId(null);
    }
  };

  const recover = async (s: RecordingSessionMeta) => {
    setBusyId(s.id);
    setError(null);
    try {
      const blob = await recordingStore.assembleBlob(s.id, s.mimeType);
      if (!blob) throw new Error(t.recoveryEmpty);
      await onRecover(blob, new Date(s.startedAt));
      // Chỉ xoá SAU khi biên bản đã lưu thành công
      await forget(s.id);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2.5">
        <i className="fas fa-life-ring text-amber-500 text-sm mt-0.5"></i>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-bold text-amber-700">{t.recoveryTitle}</p>
          <p className="text-[11px] sm:text-xs text-amber-600 leading-snug mt-0.5">{t.recoveryDesc}</p>
        </div>
      </div>

      {visible.map(s => {
        const busy = busyId === s.id;
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-2 bg-white/70 border border-amber-100 rounded-xl px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-700 truncate">
                {new Date(s.startedAt).toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400">{formatSize(s.bytes)}</p>
            </div>
            <button
              onClick={() => recover(s)}
              disabled={busy || disabled}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <i className="fas fa-spinner fa-spin"></i> : t.recoveryRecover}
            </button>
            <button
              onClick={() => download(s)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-50"
            >
              {t.recoveryDownload}
            </button>
            <button
              onClick={() => forget(s.id)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-slate-400 text-[11px] font-bold hover:text-red-500 disabled:opacity-50"
            >
              {t.recoveryDiscard}
            </button>
          </div>
        );
      })}

      {error && <p className="text-[11px] text-red-500 break-words">{error}</p>}
    </div>
  );
};

export default RecoveryBanner;
