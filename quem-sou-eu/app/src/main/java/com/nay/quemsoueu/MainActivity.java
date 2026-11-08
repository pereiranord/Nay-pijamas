package com.nay.quemsoueu;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Hospeda o jogo (HTML em assets/) num WebView e envia a inclinação do
 * celular, lida do sensor de gravidade, para o JavaScript.
 *
 * O valor enviado é o eixo Z da gravidade em m/s²: ~0 com o celular em pé na
 * testa, positivo quando a tela vira para o teto, negativo quando vira para o chão.
 */
public class MainActivity extends Activity implements SensorEventListener {

    private WebView web;
    private SensorManager sensorManager;
    private Sensor sensor;
    private boolean usingAccelerometer;
    private final float[] gravity = new float[3];
    private long lastSent;
    private volatile boolean sensorActive;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF1A0B2E);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        hideSystemBars();

        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            sensor = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY);
            if (sensor == null) {
                sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
                usingAccelerometer = true;
            }
        }

        web.loadUrl("file:///android_asset/index.html");
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void startSensor() {
        if (sensorManager != null && sensor != null) {
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    private void stopSensor() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (sensorActive) startSensor();
        web.evaluateJavascript("window.onAppResume && window.onAppResume()", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopSensor();
        web.evaluateJavascript("window.onAppPause && window.onAppPause()", null);
        web.onPause();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBackButton ? window.onBackButton() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float z;
        if (usingAccelerometer) {
            final float a = 0.8f; // filtro passa-baixa para isolar a gravidade
            gravity[0] = a * gravity[0] + (1 - a) * event.values[0];
            gravity[1] = a * gravity[1] + (1 - a) * event.values[1];
            gravity[2] = a * gravity[2] + (1 - a) * event.values[2];
            z = gravity[2];
        } else {
            z = event.values[2];
        }
        long now = System.currentTimeMillis();
        if (now - lastSent < 33) return; // ~30 leituras por segundo
        lastSent = now;
        final String js = "window.onTilt && window.onTilt(" + z + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    /** Métodos chamados pelo JavaScript como Android.nomeDoMetodo(). */
    private class Bridge {
        @JavascriptInterface
        public boolean hasSensor() {
            return sensor != null;
        }

        @JavascriptInterface
        public void setSensor(boolean on) {
            sensorActive = on;
            runOnUiThread(() -> {
                if (on) startSensor(); else stopSensor();
            });
        }

        @JavascriptInterface
        public void setLandscape(boolean landscape) {
            runOnUiThread(() -> setRequestedOrientation(landscape
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(ms);
            }
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(MainActivity.this::finish);
        }
    }
}
