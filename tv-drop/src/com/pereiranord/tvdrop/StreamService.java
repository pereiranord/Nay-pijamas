package com.pereiranord.tvdrop;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.IOException;

/**
 * Phone side. Keeps the stream server alive (and Wi-Fi awake) while the TV is
 * playing a file from the phone, even with the phone screen off.
 */
public class StreamService extends Service {
    private static final String CHANNEL = "stream";
    private static final int FGS_TYPE_SPECIAL_USE = 0x40000000;
    public static final String ACTION_STOP = "com.pereiranord.tvdrop.STOP_STREAM";
    private static volatile StreamServer server;

    private WifiManager.WifiLock wifiLock;
    private PowerManager.WakeLock wakeLock;

    /** Starts the service and server if needed; returns the local port, or 0. */
    public static synchronized int ensure(Context ctx, Uri uri) throws IOException {
        if (server == null) {
            StreamServer s = new StreamServer(ctx.getApplicationContext().getContentResolver());
            s.open();
            s.start();
            server = s;
        }
        ctx.startForegroundService(grantIntent(ctx, uri));
        return server.port();
    }

    public static StreamServer server() {
        return server;
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, StreamService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Transmissão", NotificationManager.IMPORTANCE_LOW));
        Intent stop = new Intent(this, StreamService.class).setAction(ACTION_STOP);
        PendingIntent pStop = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE);
        Intent open = new Intent(this, PhoneActivity.class);
        PendingIntent pOpen = PendingIntent.getActivity(this, 2, open, PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setContentTitle("TV Drop")
                .setContentText("Transmitindo do celular para a TV")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(pOpen)
                .addAction(new Notification.Action.Builder(null, "Parar", pStop).build())
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(2, n, FGS_TYPE_SPECIAL_USE);
        else startForeground(2, n);

        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        @SuppressWarnings("deprecation")
        int mode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
        wifiLock = wm.createWifiLock(mode, "tvdrop:stream");
        wifiLock.acquire();
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tvdrop:stream");
        wakeLock.acquire(6 * 60 * 60 * 1000L);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        synchronized (StreamService.class) {
            if (server != null) {
                server.shutdown();
                server = null;
            }
        }
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** Lets the service keep reading a picked file after the picker's grant. */
    public static Intent grantIntent(Context ctx, Uri uri) {
        Intent i = new Intent(ctx, StreamService.class);
        i.setData(uri);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return i;
    }
}
