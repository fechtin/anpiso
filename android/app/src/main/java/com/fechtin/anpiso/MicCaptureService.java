package com.fechtin.anpiso;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service giữ tiến trình sống trong lúc ghi âm cuộc họp.
 *
 * Vì sao cần: Android hạ ưu tiên (và có thể giết) tiến trình khi app xuống nền hoặc
 * màn hình tắt. Từ Android 11 trở đi, app ở nền còn bị CẤM truy cập microphone hẳn —
 * trừ khi đang chạy foreground service kiểu `microphone`. Đây là cơ chế duy nhất được
 * hỗ trợ chính thức để ghi âm tiếp khi tắt màn.
 *
 * Service này KHÔNG tự thu âm. Việc thu vẫn do WebView làm (getUserMedia + MediaRecorder);
 * service chỉ giữ cho tiến trình và quyền mic sống. Nếu sau này WebView vẫn bị Chromium
 * treo khi màn tắt thì bước tiếp theo là chuyển hẳn khâu thu âm xuống đây (AudioRecord)
 * rồi bridge PCM lên JS.
 */
public class MicCaptureService extends Service {

    private static final String TAG = "MicCaptureService";
    private static final String CHANNEL_ID = "anpiso_recording";
    private static final int NOTIFICATION_ID = 1;

    public static final String ACTION_START = "com.fechtin.anpiso.START_CAPTURE";
    public static final String ACTION_STOP = "com.fechtin.anpiso.STOP_CAPTURE";

    private PowerManager.WakeLock wakeLock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        createChannel();
        Notification notification = buildNotification();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            // Android 14+ ném SecurityException nếu RECORD_AUDIO chưa được cấp lúc start.
            // JS chỉ gọi start SAU khi getUserMedia thành công nên bình thường không xảy ra.
            Log.e(TAG, "startForeground failed", e);
            stopSelf();
            return START_NOT_STICKY;
        }

        acquireWakeLock();

        // KHÔNG dùng START_STICKY: nếu hệ thống giết tiến trình thì WebView cũng mất theo,
        // khởi động lại service trơ trọi chẳng ghi được gì — chỉ tạo notification ma.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        super.onDestroy();
    }

    /** Giữ CPU chạy khi màn tắt; không giữ màn sáng (đó là việc của Wake Lock bên JS). */
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Anpiso::Recording");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.recording_channel_name),
                // LOW: hiện thường trực nhưng không kêu, không rung — đang họp
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.recording_channel_desc));
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, openApp,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.recording_notification_title))
                .setContentText(getString(R.string.recording_notification_text))
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setOngoing(true)
                .setSilent(true)
                .setShowWhen(false)
                .setContentIntent(contentIntent)
                .build();
    }
}
