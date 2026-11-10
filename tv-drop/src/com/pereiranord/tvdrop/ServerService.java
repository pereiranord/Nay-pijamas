package com.pereiranord.tvdrop;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/** Keeps the web server running in the background. */
public class ServerService extends Service {
    private static final String CHANNEL = "server";
    private static final int FGS_TYPE_SPECIAL_USE = 0x40000000;
    private static volatile HttpServer server;

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, ServerService.class);
        try {
            ctx.startForegroundService(i);
        } catch (Exception e) {
            Events.add("Não consegui iniciar o servidor: " + e.getMessage());
        }
    }

    public static int port() {
        HttpServer s = server;
        return s == null ? 0 : s.port();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "TV Drop", NotificationManager.IMPORTANCE_LOW));
        Notification n = new Notification.Builder(this, CHANNEL)
                .setContentTitle("TV Drop")
                .setContentText("Recebendo vídeos e APKs na rede local")
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, FGS_TYPE_SPECIAL_USE);
        else startForeground(1, n);

        synchronized (ServerService.class) {
            if (server == null) {
                HttpServer s = new HttpServer(getApplicationContext());
                if (s.open()) {
                    server = s;
                    s.start();
                    Events.add("Servidor no ar: http://" + Actions.ip() + ":" + s.port());
                }
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        synchronized (ServerService.class) {
            if (server != null) {
                server.shutdown();
                server = null;
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
