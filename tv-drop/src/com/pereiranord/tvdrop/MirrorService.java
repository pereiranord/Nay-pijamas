package com.pereiranord.tvdrop;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Surface;
import android.view.WindowManager;

import java.io.BufferedOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;

/**
 * Phone: mirrors the screen to the TV. MediaProjection -> virtual display ->
 * H.264 hardware encoder -> TCP to the TV's MirrorServer. Android asks the user
 * for permission every time; apps that protect their screen (banking, Netflix
 * and other DRM video) show up black, by design. Audio is not mirrored.
 */
public class MirrorService extends Service {
    static final String EXTRA_CODE = "code", EXTRA_DATA = "data", EXTRA_TV = "tv", EXTRA_TOKEN = "token";
    static final String ACTION_STOP = "com.pereiranord.tvdrop.STOP_MIRROR";
    private static final String CHANNEL = "mirror";
    private static final int FGS_TYPE_MEDIA_PROJECTION = 0x20;
    private static volatile boolean running;
    private static volatile String lastError;

    private MediaProjection projection;
    private VirtualDisplay display;
    private MediaCodec encoder;
    private Socket socket;
    private Thread pump;

    public static boolean isRunning() { return running; }
    public static String lastError() { return lastError; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForegroundNow();
        int code = intent.getIntExtra(EXTRA_CODE, 0);
        @SuppressWarnings("deprecation")
        Intent data = intent.getParcelableExtra(EXTRA_DATA);
        String tv = intent.getStringExtra(EXTRA_TV), token = intent.getStringExtra(EXTRA_TOKEN);
        MediaProjectionManager mpm = getSystemService(MediaProjectionManager.class);
        projection = data == null ? null : mpm.getMediaProjection(code, data);
        if (projection == null || tv == null || token == null) {
            lastError = "Permissão de captura negada.";
            stopSelf();
            return START_NOT_STICKY;
        }
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                stopSelf();
            }
        }, new Handler(Looper.getMainLooper()));
        running = true;
        lastError = null;
        pump = new Thread(() -> stream(tv, token), "tvdrop-mirror-enc");
        pump.start();
        return START_NOT_STICKY;
    }

    private void startForegroundNow() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Espelhamento", NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop = PendingIntent.getService(this, 3, new Intent(this, MirrorService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setContentTitle("TV Drop")
                .setContentText("Espelhando a tela na TV")
                .setSmallIcon(android.R.drawable.ic_menu_slideshow)
                .addAction(new Notification.Action.Builder(null, "Parar", stop).build())
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(4, n, FGS_TYPE_MEDIA_PROJECTION);
        else startForeground(4, n);
    }

    private void stream(String tv, String token) {
        try {
            String[] hp = tv.split(":");
            socket = new Socket();
            socket.connect(new InetSocketAddress(hp[0], MirrorProtocol.PORT), 5000);
            socket.setTcpNoDelay(true);
            socket.setSendBufferSize(1 << 20);
            MirrorProtocol.hello(socket.getOutputStream(), token);
            InputStream in = socket.getInputStream();
            socket.setSoTimeout(8000);
            String answer = MirrorProtocol.line(in);
            if (!answer.startsWith("OK")) throw new IOException("A TV recusou: " + answer);
            socket.setSoTimeout(0);
            DataOutputStream out = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream(), 1 << 16));

            // size: the phone's screen scaled to fit 1920x1080 (portrait or landscape), even numbers
            DisplayMetrics dm = new DisplayMetrics();
            ((WindowManager) getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(dm);
            int sw = dm.widthPixels, sh = dm.heightPixels;
            float scale = Math.min(1f, Math.min(1920f / Math.max(sw, sh), 1080f / Math.min(sw, sh)));
            int w = ((int) (sw * scale)) & ~1, h = ((int) (sh * scale)) & ~1;

            MediaFormat f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h);
            f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            f.setInteger(MediaFormat.KEY_BIT_RATE, 8_000_000);
            f.setInteger(MediaFormat.KEY_FRAME_RATE, 60);
            f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
            f.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000); // keep sending when the screen is still
            if (Build.VERSION.SDK_INT >= 30) f.setInteger(MediaFormat.KEY_LOW_LATENCY, 1);
            encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
            encoder.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            Surface input = encoder.createInputSurface();
            encoder.start();
            display = projection.createVirtualDisplay("TV Drop", w, h, dm.densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, input, null, null);

            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            byte[] chunk = new byte[256 * 1024];
            while (running) {
                int idx = encoder.dequeueOutputBuffer(info, 100_000);
                if (idx < 0) continue;
                ByteBuffer buf = encoder.getOutputBuffer(idx);
                if (info.size > 0 && buf != null) {
                    if (chunk.length < info.size) chunk = new byte[info.size];
                    buf.position(info.offset);
                    buf.get(chunk, 0, info.size);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                        byte[] cfg = ByteBuffer.allocate(8 + info.size).putInt(w).putInt(h).put(chunk, 0, info.size).array();
                        MirrorProtocol.write(out, MirrorProtocol.CONFIG, 0, cfg, 0, cfg.length);
                    } else {
                        int type = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0 ? MirrorProtocol.KEYFRAME : MirrorProtocol.FRAME;
                        MirrorProtocol.write(out, type, info.presentationTimeUs, chunk, 0, info.size);
                    }
                    out.flush();
                }
                encoder.releaseOutputBuffer(idx, false);
            }
            try {
                MirrorProtocol.write(out, MirrorProtocol.END, 0, new byte[0], 0, 0);
                out.flush();
            } catch (IOException ignored) {
            }
        } catch (Exception e) {
            if (running) lastError = e.getMessage();
        } finally {
            new Handler(Looper.getMainLooper()).post(this::stopSelf);
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (display != null) display.release();
        if (encoder != null) {
            try { encoder.stop(); } catch (Exception ignored) {}
            encoder.release();
        }
        if (projection != null) projection.stop();
        if (socket != null) {
            try { socket.close(); } catch (IOException ignored) {}
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
