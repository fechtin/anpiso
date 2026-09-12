package com.fechtin.anpiso;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundRecordingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
