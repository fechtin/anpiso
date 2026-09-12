package com.fechtin.anpiso;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Cầu nối JS ⇄ {@link MicCaptureService}.
 *
 * JS gọi `start()` NGAY SAU khi getUserMedia thành công (không sớm hơn): Android 14+
 * từ chối foreground service kiểu microphone nếu RECORD_AUDIO chưa được cấp tại thời
 * điểm start.
 */
@CapacitorPlugin(name = "BackgroundRecording")
public class BackgroundRecordingPlugin extends Plugin {

    private static final int REQ_POST_NOTIFICATIONS = 9701;

    @PluginMethod
    public void start(PluginCall call) {
        ensureNotificationPermission();

        Intent intent = new Intent(getContext(), MicCaptureService.class);
        intent.setAction(MicCaptureService.ACTION_START);
        ContextCompat.startForegroundService(getContext(), intent);

        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), MicCaptureService.class);
        intent.setAction(MicCaptureService.ACTION_STOP);
        getContext().startService(intent);

        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    /**
     * Android 13+ cần quyền POST_NOTIFICATIONS thì notification của service mới hiện.
     * Thiếu quyền thì service VẪN chạy, chỉ là người dùng không thấy chỉ báo — nên xin
     * mà không chặn luồng ghi âm theo kết quả.
     */
    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        boolean granted = ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (granted || getActivity() == null) return;
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                REQ_POST_NOTIFICATIONS
        );
    }
}
