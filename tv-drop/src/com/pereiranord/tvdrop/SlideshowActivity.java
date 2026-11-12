package com.pereiranord.tvdrop;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;

import java.util.ArrayList;

/** TV: photo slideshow with a cross-fade and optional background music. Arrows change photos, Back ends it. */
public class SlideshowActivity extends Activity {
    static final String EXTRA_PATHS = "paths", EXTRA_SECONDS = "seconds", EXTRA_MUSIC = "music";
    private static volatile SlideshowActivity current;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private ArrayList<String> paths;
    private int index = -1, seconds = 6;
    private ImageView a, b;
    private boolean showingA;
    private MediaPlayer music;
    private final Runnable next = this::advance;

    static boolean stop() {
        SlideshowActivity s = current;
        if (s == null) return false;
        s.runOnUiThread(s::finish);
        return true;
    }

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        a = image();
        b = image();
        root.addView(a);
        root.addView(b);
        setContentView(root);
        load(getIntent());
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        load(intent);
    }

    private ImageView image() {
        ImageView v = new ImageView(this);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setLayoutParams(new FrameLayout.LayoutParams(-1, -1));
        v.setAlpha(0f);
        return v;
    }

    private void load(android.content.Intent i) {
        paths = i.getStringArrayListExtra(EXTRA_PATHS);
        seconds = Math.max(2, i.getIntExtra(EXTRA_SECONDS, 6));
        if (paths == null || paths.isEmpty()) { finish(); return; }
        index = -1;
        stopMusic();
        String m = i.getStringExtra(EXTRA_MUSIC);
        if (m != null) {
            try {
                music = new MediaPlayer();
                music.setDataSource(m);
                music.setLooping(true);
                music.prepare();
                music.start();
            } catch (Exception e) {
                music = null;
            }
        }
        Events.add("Slideshow: " + paths.size() + " foto(s)");
        ui.removeCallbacks(next);
        advance();
    }

    private void advance() {
        show(index + 1);
        ui.postDelayed(next, seconds * 1000L);
    }

    private void show(int i) {
        index = (i % paths.size() + paths.size()) % paths.size();
        Bitmap bmp = decode(paths.get(index));
        ImageView in = showingA ? b : a, out = showingA ? a : b;
        showingA = !showingA;
        in.setImageBitmap(bmp);
        in.animate().alpha(1f).setDuration(700).start();
        out.animate().alpha(0f).setDuration(700).start();
    }

    /** Decodes at about screen size so big phone photos don't run out of memory. */
    private Bitmap decode(String path) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, o);
        int target = Math.max(getResources().getDisplayMetrics().widthPixels, 1280);
        int sample = 1;
        while (o.outWidth / (sample * 2) >= target) sample *= 2;
        o = new BitmapFactory.Options();
        o.inSampleSize = sample;
        return BitmapFactory.decodeFile(path, o);
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_DPAD_RIGHT || code == KeyEvent.KEYCODE_MEDIA_NEXT) { restart(index + 1); return true; }
        if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_MEDIA_PREVIOUS) { restart(index - 1); return true; }
        return super.onKeyDown(code, e);
    }

    private void restart(int i) {
        ui.removeCallbacks(next);
        show(i);
        ui.postDelayed(next, seconds * 1000L);
    }

    private void stopMusic() {
        if (music != null) {
            try { music.stop(); } catch (Exception ignored) {}
            music.release();
            music = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = this;
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        ui.removeCallbacks(next);
        stopMusic();
        super.onDestroy();
    }
}
