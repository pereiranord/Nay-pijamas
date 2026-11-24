package com.pereiranord.tvdrop;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Handler;
import android.os.Looper;

import java.io.File;

/**
 * Connects Updater to Android: this app's version, which APK this device needs (the TV's or the phone's), where to
 * download, and Android's installer. One per process. Checks GitHub when started and every 12 hours.
 */
public final class AppUpdates {
    private static final long EVERY_MS = 12 * 3600_000L, MIN_GAP_MS = 30 * 60_000L;
    private static volatile Updater updater;
    private static Handler timer;
    private static boolean announced;

    private AppUpdates() {}

    public static synchronized Updater get(Context ctx) {
        if (updater == null) {
            Context app = ctx.getApplicationContext();
            int code = 0;
            String name = "?";
            try {
                PackageInfo pi = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
                code = (int) pi.getLongVersionCode();
                name = pi.versionName;
            } catch (Exception ignored) {
            }
            boolean tv = app.getPackageManager().hasSystemFeature("android.software.leanback");
            updater = new Updater(Updater.FEED, new File(app.getCacheDir(), "update"), code, name, tv ? "tv" : "celular",
                    apk -> Actions.install(app, apk), System::currentTimeMillis);
        }
        return updater;
    }

    /** Checks now (unless it did in the last half hour) and then every 12 hours while the process lives. */
    public static synchronized void schedule(Context ctx) {
        Updater u = get(ctx);
        if (System.currentTimeMillis() - u.checkedAt() > MIN_GAP_MS) u.checkAsync();
        if (timer != null) return;
        timer = new Handler(Looper.getMainLooper());
        timer.postDelayed(new Runnable() {
            @Override
            public void run() {
                get(ctx).checkAsync();
                timer.postDelayed(this, EVERY_MS);
            }
        }, EVERY_MS);
        // tell the TV's log once when a new version shows up
        timer.postDelayed(new Runnable() {
            @Override
            public void run() {
                Updater x = get(ctx);
                if (x.available() && !announced) {
                    announced = true;
                    Events.add("Nova versão do TV Drop: " + x.status().optString("latest") + ". Atualize na tela do TV Drop ou pelo celular (Ajustes).");
                }
                if (!announced) timer.postDelayed(this, 60_000);
            }
        }, 20_000);
    }

    /** InstallReceiver: what Android's installer answered for our own update. */
    static void result(boolean ok, String message) {
        Updater u = updater;
        if (u != null) u.installResult(ok, message);
    }

    static boolean isOurs(String fileName) {
        return Updater.DOWNLOAD_NAME.equals(fileName);
    }
}
