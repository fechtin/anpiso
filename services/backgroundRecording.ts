import { Capacitor, registerPlugin } from '@capacitor/core';
import { logService } from './logService';

interface BackgroundRecordingPlugin {
  start(): Promise<{ started: boolean }>;
  stop(): Promise<{ stopped: boolean }>;
}

const plugin = registerPlugin<BackgroundRecordingPlugin>('BackgroundRecording');

/**
 * Foreground service giữ tiến trình + quyền mic sống khi tắt màn (chỉ Android native).
 *
 * Trên web thuần (PWA) không có cơ chế tương đương: mọi hàm ở đây thành no-op và app
 * rơi về các biện pháp giảm thiểu của giai đoạn 1 (Wake Lock, persist IndexedDB, cảnh báo).
 */
export const backgroundRecording = {
  isAvailable(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  /**
   * PHẢI gọi SAU khi getUserMedia thành công: Android 14+ từ chối foreground service
   * kiểu microphone nếu RECORD_AUDIO chưa được cấp tại thời điểm start.
   */
  async start(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await plugin.start();
      logService.add('audio', 'info', 'fgservice', 'Foreground service started — ghi âm tiếp được khi tắt màn');
    } catch (err: any) {
      // Không chặn cuộc họp: thiếu service thì vẫn ghi được khi màn còn sáng
      logService.add('audio', 'info', 'fgservice', `Không bật được foreground service: ${err?.message || err}`);
    }
  },

  async stop(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await plugin.stop();
      logService.add('audio', 'info', 'fgservice', 'Foreground service stopped');
    } catch {
      // Service tự chết khi tiến trình kết thúc — không có gì để xử lý
    }
  },
};
