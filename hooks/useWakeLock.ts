import { useEffect, useRef, useState } from 'react';

interface WakeLockSentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, cb: () => void) => void;
}

export const isWakeLockSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Giữ màn hình sáng suốt phiên ghi âm.
 *
 * Vì sao cần: màn tắt → tab bị ẩn → trình duyệt suspend AudioContext/MediaRecorder →
 * mất tiếng giữa cuộc họp. Wake Lock chặn đúng ca phổ biến nhất là màn TỰ tắt.
 * Nó KHÔNG chặn được người dùng chủ động bấm nút nguồn, và iOS < 16.4 không hỗ trợ —
 * hai ca đó phải cảnh báo bằng UI (RecorderControls) thay vì im lặng.
 *
 * Trình duyệt tự huỷ sentinel mỗi lần tab ẩn, nên phải xin lại khi tab hiện lại.
 */
export const useWakeLock = (active: boolean) => {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!isWakeLockSupported()) return;

    let disposed = false;

    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setHeld(false);
      sentinel?.release().catch(() => {});
    };

    if (!active) {
      release();
      return;
    }

    const request = async () => {
      if (!activeRef.current || sentinelRef.current) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel: WakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        // Đã dừng ghi trong lúc await → trả lại ngay, đừng giữ màn sáng vô cớ
        if (disposed || !activeRef.current) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setHeld(true);
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
          setHeld(false);
        });
      } catch {
        setHeld(false); // quyền bị từ chối / tiết kiệm pin — UI sẽ cảnh báo
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);

  return { supported: isWakeLockSupported(), held };
};
