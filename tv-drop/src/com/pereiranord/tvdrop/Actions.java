package com.pereiranord.tvdrop;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.provider.Settings;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Locale;

/** Things the server and the TV screen can ask for: play a video, install an APK. */
public final class Actions {
    private Actions() {}

    public static File inbox(Context ctx) {
        File dir = ctx.getExternalFilesDir("recebidos");
        if (dir == null) dir = new File(ctx.getFilesDir(), "recebidos");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    public static boolean isApk(String name) {
        return name.toLowerCase(Locale.ROOT).endsWith(".apk");
    }

    public static boolean isVideo(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        String[] ext = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v", ".3gp", ".ts", ".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg"};
        for (String e : ext) if (n.endsWith(e)) return true;
        return false;
    }

    /** Plays a URL (http/https/rtsp/HLS) or an absolute file path on the TV. */
    public static void play(Context ctx, String what) {
        play(ctx, what, -1);
    }

    public static void play(Context ctx, String what, long startMs) {
        Intent i = new Intent(ctx, PlayerActivity.class);
        i.putExtra(PlayerActivity.EXTRA_SOURCE, what);
        if (startMs >= 0) i.putExtra(PlayerActivity.EXTRA_START, startMs); // -1 (absent) = continue where it stopped
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        ctx.startActivity(i);
        Events.add("Reproduzindo: " + shortName(what));
    }

    /** Starts a system install for the APK; Android always asks for confirmation on the TV. */
    public static void install(Context ctx, File apk) throws IOException {
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setSize(apk.length());
        int id = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (OutputStream out = s.openWrite("base.apk", 0, apk.length());
                 InputStream in = new FileInputStream(apk)) {
                byte[] buf = new byte[256 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out);
            }
            Intent cb = new Intent(ctx, InstallReceiver.class);
            cb.putExtra(InstallReceiver.EXTRA_NAME, apk.getName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent p = PendingIntent.getBroadcast(ctx, id, cb, flags);
            s.commit(p.getIntentSender());
        }
        Events.add("Instalando: " + apk.getName());
    }

    public static boolean canOverlay(Context ctx) {
        return Settings.canDrawOverlays(ctx);
    }

    public static boolean canInstall(Context ctx) {
        return ctx.getPackageManager().canRequestPackageInstalls();
    }

    /** First IPv4 address on Wi-Fi or Ethernet. */
    public static String ip() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) {
        }
        return "sem rede";
    }

    public static String shortName(String s) {
        int i = s.lastIndexOf('/');
        String n = i >= 0 && i < s.length() - 1 ? s.substring(i + 1) : s;
        return n.length() > 60 ? n.substring(0, 57) + "..." : n;
    }
}
