package com.pereiranord.tvdrop;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.media.MediaFormat;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.MediaController;
import android.widget.TextView;
import android.widget.VideoView;

/** Full-screen player. Remote: OK = pause/play, left/right = 10 s, up/down = 60 s. */
public class PlayerActivity extends Activity {
    public static final String EXTRA_SOURCE = "source";
    private static volatile PlayerActivity current;
    private static volatile String playing;
    private static volatile int pos, dur;
    private static volatile boolean isPaused;
    private static volatile String audio = "";
    private int generation;
    private final android.os.Handler ticker = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable tick = this::tick;

    private VideoView video;
    private MediaController controller;
    private TextView label;

    public static String nowPlaying() {
        return current == null ? null : playing;
    }

    public static int position() { return current == null ? 0 : pos; }
    public static int duration() { return current == null ? 0 : dur; }
    public static boolean paused() { return current != null && isPaused; }
    public static String audioInfo() { return current == null ? "" : audio; }

    /** Called from the web server thread. Returns false when nothing is playing. */
    public static boolean control(String cmd, long arg) {
        final PlayerActivity p = current;
        if (p == null) return false;
        p.runOnUiThread(() -> {
            if ("seek".equals(cmd)) p.seekTo((int) arg);
            else if ("external".equals(cmd)) p.openExternal();
            else p.handle(cmd);
        });
        return true;
    }

    /** Caches the player state for /api/status (MediaPlayer must be read on this thread). */
    private void tick() {
        try {
            pos = video.getCurrentPosition();
            int d = video.getDuration();
            dur = d > 0 ? d : 0;
            isPaused = !video.isPlaying();
        } catch (Exception ignored) {
        }
        ticker.postDelayed(tick, 500);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        video = new VideoView(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER);
        root.addView(video, lp);
        label = new TextView(this);
        label.setTextColor(Color.WHITE);
        label.setTextSize(22);
        label.setShadowLayer(6, 0, 0, Color.BLACK);
        label.setPadding(48, 32, 48, 32);
        root.addView(label, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START));
        setContentView(root);
        controller = new MediaController(this);
        controller.setAnchorView(video);
        video.setMediaController(controller);
        video.setOnPreparedListener(mp -> {
            label.setText("");
            pickAudioTrack(mp);
            video.start();
        });
        video.setOnCompletionListener(mp -> {
            Events.add("Terminou: " + Actions.shortName(String.valueOf(playing)));
            finish();
        });
        video.setOnErrorListener((mp, what, extra) -> {
            label.setText("Não foi possível tocar este vídeo (" + what + "/" + extra + ")");
            Events.add("Erro ao tocar: " + Actions.shortName(String.valueOf(playing)) + " (" + what + "/" + extra + ")");
            return true;
        });
        load(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        load(intent);
    }

    private void load(Intent intent) {
        String src = intent.getStringExtra(EXTRA_SOURCE);
        if (src == null && intent.getData() != null) src = intent.getData().toString();
        if (src == null) {
            finish();
            return;
        }
        playing = src;
        pos = 0;
        dur = 0;
        audio = "";
        label.setText("Carregando " + Actions.shortName(src) + "...");
        video.stopPlayback();

        // Look at the audio tracks first (a few seconds at most), then decide who plays it.
        final String s = src;
        final int gen = ++generation;
        new Thread(() -> {
            AudioSupport.Probe probe = AudioSupport.probe(s);
            runOnUiThread(() -> start(s, gen, probe));
        }, "tvdrop-probe").start();
        label.postDelayed(() -> start(s, gen, null), 8000);
    }

    private void start(String src, int gen, AudioSupport.Probe probe) {
        if (gen != generation || isFinishing()) return;
        generation++; // first caller wins: probe result or timeout
        if (probe != null) audio = probe.summary;
        if (probe != null && probe.audioTracks > 0 && probe.playableTracks == 0) {
            String fmt = probe.firstUnplayable;
            Events.add("A TV não decodifica o áudio " + fmt + " de " + Actions.shortName(src));
            if (AudioSupport.openExternal(this, src, Actions.shortName(src))) {
                finish();
                return;
            }
            label.setText("Esta TV não toca o áudio " + fmt + " deste vídeo, então ele vai ficar sem som.\n"
                    + "Instale o VLC na TV (dá para enviar o APK pelo TV Drop) e o vídeo abre nele com som.");
            Events.add("Instale o VLC na TV para tocar " + fmt + " com som.");
        }
        if (src.startsWith("/")) video.setVideoPath(src);
        else video.setVideoURI(Uri.parse(src));
    }

    /** MKVs often have several audio tracks (e.g. DTS + AC3): use one the TV can decode, Portuguese first. */
    private void pickAudioTrack(MediaPlayer mp) {
        try {
            MediaPlayer.TrackInfo[] tracks = mp.getTrackInfo();
            int selected = mp.getSelectedTrack(MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO);
            int best = -1, bestScore = -1;
            boolean selectedOk = false;
            for (int i = 0; i < tracks.length; i++) {
                if (tracks[i].getTrackType() != MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO) continue;
                MediaFormat f = tracks[i].getFormat();
                String mime = f == null ? null : f.getString(MediaFormat.KEY_MIME);
                boolean ok = mime == null || AudioSupport.canDecode(mime);
                if (i == selected) selectedOk = ok;
                if (!ok) continue;
                String lang = String.valueOf(tracks[i].getLanguage()).toLowerCase(java.util.Locale.ROOT);
                int score = (lang.startsWith("por") || lang.startsWith("pt")) ? 2 : 1;
                if (score > bestScore) { best = i; bestScore = score; }
            }
            if (best >= 0 && (!selectedOk || (bestScore == 2 && best != selected))) {
                mp.selectTrack(best);
                MediaFormat f = tracks[best].getFormat();
                String name = f == null ? "?" : AudioSupport.name(f.getString(MediaFormat.KEY_MIME));
                Events.add("Áudio escolhido: " + name + " " + tracks[best].getLanguage());
            }
        } catch (Exception e) {
            Events.add("Não consegui trocar a faixa de áudio: " + e.getMessage());
        }
    }

    private void openExternal() {
        String src = playing;
        if (src != null && AudioSupport.openExternal(this, src, Actions.shortName(src))) {
            finish();
        } else {
            label.setText("Nenhum player externo (VLC, mpv, MX Player) instalado na TV.");
            Events.add("Nenhum player externo instalado. Instale o VLC na TV.");
        }
    }

    private void handle(String cmd) {
        switch (cmd) {
            case "toggle":
                if (video.isPlaying()) video.pause(); else video.start();
                controller.show(3000);
                break;
            case "play": video.start(); break;
            case "pause": video.pause(); break;
            case "fwd": seek(30_000); break;
            case "back": seek(-10_000); break;
            case "stop": finish(); break;
            default: break;
        }
    }

    private void seek(int ms) {
        seekTo(video.getCurrentPosition() + ms);
    }

    private void seekTo(int to) {
        to = Math.max(0, to);
        int d = video.getDuration();
        if (d > 0) to = Math.min(to, d - 1000);
        video.seekTo(to);
        controller.show(3000);
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                handle("toggle");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: handle("play"); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: handle("pause"); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                seek(10_000); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                seek(-10_000); return true;
            case KeyEvent.KEYCODE_DPAD_UP: seek(60_000); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: seek(-60_000); return true;
            case KeyEvent.KEYCODE_MEDIA_STOP: finish(); return true;
            default: return super.onKeyDown(code, e);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = this;
        ticker.post(tick);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    protected void onPause() {
        ticker.removeCallbacks(tick);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        video.stopPlayback();
        super.onDestroy();
    }
}
