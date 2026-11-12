package com.pereiranord.tvdrop;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.os.IBinder;

/** Keeps the web server running in the background. */
public class ServerService extends Service {
    private static final String CHANNEL = "server";
    private static final int FGS_TYPE_SPECIAL_USE = 0x40000000;
    private static volatile HttpServer server;
    private static volatile Pairing pairing;
    private static volatile Library library;
    private NsdManager.RegistrationListener nsdReg;
    private MirrorServer mirror;

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, ServerService.class);
        try {
            ctx.startForegroundService(i);
        } catch (Exception e) {
            Events.add("Não consegui iniciar o servidor: " + e.getMessage());
        }
    }

    /** Paired devices and the current PIN (shared by the server and the TV screen). */
    public static synchronized Pairing pairing(Context ctx) {
        if (pairing == null) pairing = new Pairing(new PrefsStore(ctx, "pairing"));
        return pairing;
    }

    /** Queue, playlists and history (shared by the server and the player). */
    public static synchronized Library library(Context ctx) {
        if (library == null) library = new Library(new PrefsStore(ctx, "library"));
        return library;
    }

    public static HttpServer server() {
        return server;
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
                HttpServer s = new HttpServer(new AndroidTvHost(getApplicationContext()), pairing(this), library(this));
                if (s.open()) {
                    server = s;
                    s.start();
                    Events.add("Servidor no ar: http://" + Actions.ip() + ":" + s.port());
                }
            }
        }
        if (server != null) advertise(server.port());
        if (getPackageManager().hasSystemFeature("android.software.leanback")) {
            mirror = new MirrorServer(this, pairing(this));
            if (mirror.open()) mirror.start();
            else mirror = null;
        }
    }

    /** Announces the TV on the network (mDNS) so the phone app finds it by itself. */
    private void advertise(int port) {
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(server.tvName());
        info.setServiceType(Discovery.TYPE);
        info.setPort(port);
        nsdReg = new NsdManager.RegistrationListener() {
            @Override public void onRegistrationFailed(NsdServiceInfo i, int e) { Events.add("Anúncio na rede falhou (" + e + "); use o código."); }
            @Override public void onUnregistrationFailed(NsdServiceInfo i, int e) {}
            @Override public void onServiceRegistered(NsdServiceInfo i) {}
            @Override public void onServiceUnregistered(NsdServiceInfo i) {}
        };
        try {
            getSystemService(NsdManager.class).registerService(info, NsdManager.PROTOCOL_DNS_SD, nsdReg);
        } catch (Exception e) {
            nsdReg = null;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (mirror != null) mirror.shutdown();
        if (nsdReg != null) {
            try {
                getSystemService(NsdManager.class).unregisterService(nsdReg);
            } catch (Exception ignored) {
            }
        }
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
