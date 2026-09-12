import React from 'react';
import { useLocale } from '../i18n';
import { backgroundRecording } from '../services/backgroundRecording';

/**
 * Cảnh báo về giới hạn nền tảng khi đang ghi âm.
 *
 * Trình duyệt trên điện thoại suspend luồng audio khi màn tắt. Wake Lock chặn được
 * ca màn TỰ tắt; iOS khoá máy thì không có cách nào — nên thà nói thẳng còn hơn để
 * người dùng tin app vẫn đang ghi rồi mất cả cuộc họp.
 */
const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS ≥ 13 khai user-agent giống macOS, phân biệt bằng touch
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));

interface Props {
  isRecording: boolean;
  audioStalled: boolean;
  wakeLockSupported: boolean;
  wakeLockHeld: boolean;
}

const RecordingGuard: React.FC<Props> = ({ isRecording, audioStalled, wakeLockSupported, wakeLockHeld }) => {
  const { t } = useLocale();
  if (!isRecording) return null;

  if (audioStalled) {
    return (
      <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
        <i className="fas fa-triangle-exclamation text-red-500 text-sm mt-0.5"></i>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-bold text-red-600">{t.audioStalledTitle}</p>
          <p className="text-[11px] sm:text-xs text-red-500 leading-snug mt-0.5">{t.audioStalledDesc}</p>
        </div>
      </div>
    );
  }

  // Bản Android native: foreground service lo việc ghi khi tắt màn, không có gì để dặn.
  // Cảnh báo "giữ màn sáng" ở đây sẽ là lời khuyên sai.
  if (backgroundRecording.isAvailable()) return null;

  // Wake Lock đang giữ màn sáng trên máy không phải iOS → không còn gì để cảnh báo
  if (wakeLockHeld && !isIOS()) return null;

  const desc = isIOS()
    ? t.keepScreenOnIos
    : wakeLockSupported
      ? t.keepScreenOnGeneric
      : t.keepScreenOnUnsupported;

  return (
    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
      <i className="fas fa-mobile-screen text-amber-500 text-sm mt-0.5"></i>
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-bold text-amber-700">{t.keepScreenOnTitle}</p>
        <p className="text-[11px] sm:text-xs text-amber-600 leading-snug mt-0.5">{desc}</p>
      </div>
    </div>
  );
};

export default RecordingGuard;
