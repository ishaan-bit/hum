package com.qdenxp.hum;

import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private static final int HUM_RECORD_AUDIO_PERMISSION_REQUEST = 8101;
    private PermissionRequest pendingAudioPermissionRequest;

    @Override
    protected void load() {
        super.load();
        getBridge().getWebView().setWebChromeClient(new HumWebChromeClient());
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        @NonNull String[] permissions,
        @NonNull int[] grantResults
    ) {
        if (requestCode == HUM_RECORD_AUDIO_PERMISSION_REQUEST) {
            PermissionRequest request = pendingAudioPermissionRequest;
            pendingAudioPermissionRequest = null;
            if (request != null && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
            } else if (request != null) {
                request.deny();
            }
            return;
        }

        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private class HumWebChromeClient extends BridgeWebChromeClient {
        HumWebChromeClient() {
            super(getBridge());
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            boolean wantsAudio = false;
            boolean wantsOnlyAudio = true;

            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                    wantsAudio = true;
                } else {
                    wantsOnlyAudio = false;
                }
            }

            if (!wantsAudio || !wantsOnlyAudio) {
                request.deny();
                return;
            }

            if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                return;
            }

            if (pendingAudioPermissionRequest != null) {
                pendingAudioPermissionRequest.deny();
            }
            pendingAudioPermissionRequest = request;
            ActivityCompat.requestPermissions(
                MainActivity.this,
                new String[] { Manifest.permission.RECORD_AUDIO },
                HUM_RECORD_AUDIO_PERMISSION_REQUEST
            );
        }
    }
}
