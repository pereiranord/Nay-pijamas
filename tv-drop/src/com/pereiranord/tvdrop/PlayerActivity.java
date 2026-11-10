package com.pereiranord.tvdrop;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.PlayerView;

import java.io.File;

/**
 * Full-screen player built on ExoPlayer:
 *  - video goes through the TV's hardware decoder (full quality, HDR);
 *  - audio the TV can't decode (DTS, TrueHD, AC3...) is decoded in the app
 *    by FFmpeg, or sent untouched to a soundbar that supports it;
 *  - Portuguese audio/subtitles are preferred when the file has them.
 * Remote: OK = pause/play, left/right = 10 s, up = +60 s (when the bar is hidden).
 */
public class PlayerActivity extends Activity {
    public static final String EXTRA_SOURCE = "source";
    private static volatile PlayerActivity current;
    private static volatile String playing;
    private static volatile long pos, dur;
    private static volatile boolean isPaused;
    private static volatile String audio = "";

    private final Handler ticker = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::tick;
    private ExoPlayer player;
    private PlayerView view;
    private TextView label;

    public static String nowPlaying() { return current == null ? null : playing; }
    public static long position() { return current == null ? 0 : pos; }
    public static long duration() { return current == null ? 0 : dur; }
    public static boolean paused() { return current != null && isPaused; }
    public static String audioInfo() { return current == null ? "" : audio; }

    /** Called from the web server thread. Returns false when nothing is playing. */
    public static boolean control(String cmd, long arg) {
        final PlayerActivity p = current;
        if (p == null) return false;
        p.runOnUiThread(() -> {
            if ("seek".equals(cmd)) p.seekTo(arg);
            else if ("external".equals(cmd)) p.openExternal();
            else p.handle(cmd);
        });
        return true;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
                // Use FFmpeg only for formats the TV's own decoders can't handle.
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
                .setEnableDecoderFallback(true);
        DefaultTrackSelector selector = new DefaultTrackSelector(this);
        selector.setParameters(selector.buildUponParameters()
                .setPreferredAudioLanguage("pt")
                .setPreferredTextLanguage("pt"));
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("TVDrop")
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(10_000)
                .setReadTimeoutMs(30_000);
        player = new ExoPlayer.Builder(this, renderers)
                .setTrackSelector(selector)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
                .setHandleAudioBecomingNoisy(true)
                .build();
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) label.setText("");
                if (state == Player.STATE_ENDED) {
                    Events.add("Terminou: " + Actions.shortName(String.valueOf(playing)));
                    finish();
                }
            }

            @Override
            public void onPlayerError(PlaybackException e) {
                label.setText("Não foi possível tocar este vídeo: " + e.getErrorCodeName()
                        + "\nSe o celular estiver transmitindo, confira se ele continua no Wi-Fi.");
                Events.add("Erro ao tocar " + Actions.shortName(String.valueOf(playing)) + ": " + e.getErrorCodeName());
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                audio = describeAudio(tracks);
                if (!audio.isEmpty()) Events.add("Áudio: " + audio);
            }
        });

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setPlayer(player);
        view.setKeepScreenOn(true);
        view.setControllerShowTimeoutMs(3000);
        view.setShowSubtitleButton(true);
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));
        label = new TextView(this);
        label.setTextColor(Color.WHITE);
        label.setTextSize(22);
        label.setShadowLayer(6, 0, 0, Color.BLACK);
        label.setPadding(48, 32, 48, 32);
        root.addView(label, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START));
        setContentView(root);

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
        Uri uri = src.startsWith("/") ? Uri.fromFile(new File(src)) : Uri.parse(src);
        player.setMediaItem(MediaItem.fromUri(uri));
        player.prepare();
        player.setPlayWhenReady(true);
    }

    /** e.g. "DTS 5.1 · por · decodificado pelo app" */
    private static String describeAudio(Tracks tracks) {
        for (Tracks.Group g : tracks.getGroups()) {
            if (g.getType() != C.TRACK_TYPE_AUDIO) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSelected(i)) continue;
                Format f = g.getTrackFormat(i);
                StringBuilder sb = new StringBuilder(AudioSupport.name(f.sampleMimeType));
                if (f.channelCount == 6) sb.append(" 5.1");
                else if (f.channelCount == 8) sb.append(" 7.1");
                else if (f.channelCount == 2) sb.append(" estéreo");
                if (f.language != null && !"und".equals(f.language)) sb.append(" · ").append(f.language);
                if (!AudioSupport.canDecode(f.sampleMimeType)) sb.append(" · decodificado pelo app");
                return sb.toString();
            }
        }
        return "";
    }

    private void tick() {
        pos = Math.max(0, player.getCurrentPosition());
        long d = player.getDuration();
        dur = d == C.TIME_UNSET ? 0 : d;
        isPaused = !player.isPlaying();
        ticker.postDelayed(tick, 500);
    }

    private void handle(String cmd) {
        switch (cmd) {
            case "toggle": player.setPlayWhenReady(!player.getPlayWhenReady()); view.showController(); break;
            case "play": player.play(); break;
            case "pause": player.pause(); break;
            case "fwd": seek(30_000); break;
            case "back": seek(-10_000); break;
            case "stop": finish(); break;
            default: break;
        }
    }

    private void seek(long ms) {
        seekTo(player.getCurrentPosition() + ms);
    }

    private void seekTo(long to) {
        long d = player.getDuration();
        to = Math.max(0, to);
        if (d != C.TIME_UNSET && d > 0) to = Math.min(to, d - 1000);
        player.seekTo(to);
        view.showController();
    }

    private void openExternal() {
        String src = playing;
        if (src != null && AudioSupport.openExternal(this, src, Actions.shortName(src))) {
            finish();
        } else {
            label.setText("Nenhum player externo (VLC, mpv, MX Player) instalado na TV.");
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // With the control bar hidden, the remote's arrows seek and OK pauses.
        // With it visible, the arrows move between its buttons as usual.
        if (e.getAction() == KeyEvent.ACTION_DOWN && !view.isControllerFullyVisible()) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                    handle("toggle"); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: seek(10_000); return true;
                case KeyEvent.KEYCODE_DPAD_LEFT: seek(-10_000); return true;
                case KeyEvent.KEYCODE_DPAD_UP: seek(60_000); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: view.showController(); return true;
                default: break;
            }
        }
        if (e.getAction() == KeyEvent.ACTION_DOWN && e.getKeyCode() == KeyEvent.KEYCODE_MEDIA_STOP) {
            finish();
            return true;
        }
        return super.dispatchKeyEvent(e);
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
    protected void onStop() {
        // Leaving the player (Home button) pauses instead of playing in the background.
        player.pause();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        player.release();
        super.onDestroy();
    }
}
