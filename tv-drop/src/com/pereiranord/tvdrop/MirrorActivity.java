package com.pereiranord.tvdrop;

import android.app.Activity;
import android.graphics.Color;
import android.media.MediaCodec;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.util.List;

/**
 * TV: shows the phone's screen. H.264 from the phone is decoded by the TV's
 * hardware decoder in low-latency mode and drawn straight to the screen.
 * The remote's Back button ends mirroring.
 */
public class MirrorActivity extends Activity implements SurfaceHolder.Callback {
    private static volatile Socket pendingSocket;
    private static volatile InputStream pendingIn;

    private SurfaceView surface;
    private TextView label;
    private volatile boolean running;
    private Thread reader;

    static void offer(Socket s, InputStream in) {
        pendingSocket = s;
        pendingIn = in;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        surface = new SurfaceView(this);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        label = new TextView(this);
        label.setTextColor(Color.WHITE);
        label.setTextSize(22);
        label.setPadding(48, 32, 48, 32);
        label.setText("Aguardando a tela do celular…");
        root.addView(label, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START));
        setContentView(root);
        surface.getHolder().addCallback(this);
    }

    @Override
    public void surfaceCreated(SurfaceHolder h) {
        start();
    }

    @Override public void surfaceChanged(SurfaceHolder h, int f, int w, int ht) {}

    @Override
    public void surfaceDestroyed(SurfaceHolder h) {
        stop();
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        stop();
        if (surface.getHolder().getSurface().isValid()) start();
    }

    private void start() {
        final Socket s = pendingSocket;
        final InputStream in = pendingIn;
        pendingSocket = null;
        pendingIn = null;
        if (s == null || s.isClosed()) {
            finish();
            return;
        }
        running = true;
        reader = new Thread(() -> decodeLoop(s, in), "tvdrop-mirror-dec");
        reader.start();
    }

    private void decodeLoop(Socket s, InputStream raw) {
        MediaCodec codec = null;
        try {
            DataInputStream in = new DataInputStream(raw);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while (running) {
                MirrorProtocol.Packet p = MirrorProtocol.read(in);
                if (p.type == MirrorProtocol.END) break;
                if (p.type == MirrorProtocol.CONFIG) {
                    if (codec != null) { codec.stop(); codec.release(); }
                    codec = configure(p.data);
                    final int w = ByteBuffer.wrap(p.data).getInt(0), h = ByteBuffer.wrap(p.data).getInt(4);
                    runOnUiThread(() -> { label.setText(""); fit(w, h); });
                    continue;
                }
                if (codec == null) continue; // wait for the configuration
                int idx = codec.dequeueInputBuffer(20_000);
                if (idx >= 0) {
                    ByteBuffer buf = codec.getInputBuffer(idx);
                    buf.clear();
                    if (p.data.length <= buf.remaining()) {
                        buf.put(p.data);
                        codec.queueInputBuffer(idx, 0, p.data.length, p.ptsUs,
                                p.type == MirrorProtocol.KEYFRAME ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
                    } else {
                        codec.queueInputBuffer(idx, 0, 0, p.ptsUs, 0);
                    }
                }
                // render everything that is ready, right away (latency over smoothness)
                int out;
                while ((out = codec.dequeueOutputBuffer(info, 0)) >= 0) codec.releaseOutputBuffer(out, true);
            }
        } catch (IOException | IllegalStateException e) {
            // phone stopped, network dropped, or the user pressed Back
        } finally {
            if (codec != null) {
                try { codec.stop(); } catch (Exception ignored) {}
                codec.release();
            }
            try { s.close(); } catch (IOException ignored) {}
            if (running) runOnUiThread(() -> {
                Events.add("Espelhamento encerrado");
                finish();
            });
        }
    }

    private MediaCodec configure(byte[] cfg) throws IOException {
        ByteBuffer bb = ByteBuffer.wrap(cfg);
        int w = bb.getInt(), h = bb.getInt();
        byte[] csd = new byte[cfg.length - 8];
        System.arraycopy(cfg, 8, csd, 0, csd.length);
        MediaFormat f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h);
        byte[] sps = null, pps = null;
        for (byte[] nal : MirrorProtocol.nalUnits(csd)) {
            int type = nal.length > 0 ? nal[0] & 0x1f : 0;
            if (type == 7) sps = withStartCode(nal);
            if (type == 8) pps = withStartCode(nal);
        }
        if (sps != null) f.setByteBuffer("csd-0", ByteBuffer.wrap(sps));
        if (pps != null) f.setByteBuffer("csd-1", ByteBuffer.wrap(pps));
        if (Build.VERSION.SDK_INT >= 30) f.setInteger(MediaFormat.KEY_LOW_LATENCY, 1);
        f.setInteger(MediaFormat.KEY_PRIORITY, 0);
        MediaCodec c = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        c.configure(f, surface.getHolder().getSurface(), null, 0);
        c.start();
        return c;
    }

    private static byte[] withStartCode(byte[] nal) {
        byte[] b = new byte[nal.length + 4];
        b[3] = 1;
        System.arraycopy(nal, 0, b, 4, nal.length);
        return b;
    }

    /** Letterboxes the phone's aspect ratio inside the TV screen. */
    private void fit(int w, int h) {
        View root = (View) surface.getParent();
        int rw = root.getWidth(), rh = root.getHeight();
        if (rw == 0 || rh == 0 || w == 0 || h == 0) return;
        float scale = Math.min(rw / (float) w, rh / (float) h);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.round(w * scale), Math.round(h * scale), Gravity.CENTER);
        surface.setLayoutParams(lp);
    }

    private void stop() {
        running = false;
        MirrorServer.stopActive();
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) {
            stop();
            finish();
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onDestroy() {
        stop();
        super.onDestroy();
    }
}
