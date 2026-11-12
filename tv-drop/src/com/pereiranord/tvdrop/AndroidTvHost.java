package com.pereiranord.tvdrop;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** TvHost on a real Android TV. */
final class AndroidTvHost implements TvHost {
    private final Context ctx;
    private final AndroidRemote remote;

    AndroidTvHost(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.remote = new AndroidRemote(this.ctx);
    }

    // ---- device ----

    @Override public String ip() { return Actions.ip(); }
    @Override public String deviceName() { return "TV Drop (" + model() + ")"; }
    @Override public String model() { return Build.MODEL; }
    @Override public int sdk() { return Build.VERSION.SDK_INT; }
    @Override public String androidRelease() { return Build.VERSION.RELEASE; }

    @Override
    public String appVersion() {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    @Override
    public byte[] webAsset(String name) throws IOException {
        try (InputStream in = ctx.getAssets().open("web/" + name)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toByteArray();
        } catch (java.io.FileNotFoundException e) {
            return null;
        }
    }

    // ---- files and player ----

    @Override public File inbox() { return Actions.inbox(ctx); }
    @Override public void play(String src) { Actions.play(ctx, src, 0); }
    @Override public void play(String src, long startMs) { Actions.play(ctx, src, startMs); }
    @Override public JSONObject playerTracks() { return PlayerActivity.tracks(); }
    @Override public boolean playerSelectTrack(String type, int group, int track) { return PlayerActivity.selectTrack(type, group, track); }
    @Override public boolean playerSpeed(float speed) { return PlayerActivity.speed(speed); }
    @Override public void install(File apk) throws IOException { Actions.install(ctx, apk); }
    @Override public boolean canInstall() { return Actions.canInstall(ctx); }
    @Override public boolean canOverlay() { return Actions.canOverlay(ctx); }
    @Override public String nowPlaying() { return PlayerActivity.nowPlaying(); }
    @Override public long position() { return PlayerActivity.position(); }
    @Override public long duration() { return PlayerActivity.duration(); }
    @Override public boolean paused() { return PlayerActivity.paused(); }
    @Override public String audioInfo() { return PlayerActivity.audioInfo(); }
    @Override public boolean playerControl(String cmd, long arg) { return PlayerActivity.control(cmd, arg); }

    @Override
    public String externalPlayerName() {
        return AudioSupport.playerName(AudioSupport.externalPlayer(ctx));
    }

    @Override
    public void volume(String action) {
        AudioManager am = ctx.getSystemService(AudioManager.class);
        int dir = "up".equals(action) ? AudioManager.ADJUST_RAISE
                : "down".equals(action) ? AudioManager.ADJUST_LOWER : AudioManager.ADJUST_TOGGLE_MUTE;
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, AudioManager.FLAG_SHOW_UI);
    }

    @Override public RemoteControl remote() { return remote; }

    // ---- apps ----

    @Override
    public List<AppInfo> apps() {
        PackageManager pm = ctx.getPackageManager();
        Set<String> seen = new HashSet<>();
        List<AppInfo> out = new ArrayList<>();
        for (String category : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(category);
            for (ResolveInfo r : pm.queryIntentActivities(i, 0)) {
                String pkg = r.activityInfo.packageName;
                if (pkg.equals(ctx.getPackageName()) || !seen.add(pkg)) continue;
                CharSequence label = r.loadLabel(pm);
                boolean system = (r.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                out.add(new AppInfo(pkg, label == null ? pkg : label.toString(), system));
            }
        }
        Collections.sort(out, (a, b) -> a.label.toLowerCase(Locale.ROOT).compareTo(b.label.toLowerCase(Locale.ROOT)));
        return out;
    }

    @Override
    public byte[] appIcon(String pkg) {
        try {
            PackageManager pm = ctx.getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            Drawable d = pm.getApplicationBanner(ai);
            if (d == null) d = pm.getApplicationIcon(ai);
            return png(d, d.getIntrinsicWidth() > d.getIntrinsicHeight() ? 320 : 160);
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] png(Drawable d, int maxW) {
        Bitmap bmp;
        if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) {
            bmp = ((BitmapDrawable) d).getBitmap();
        } else {
            int w = Math.max(1, d.getIntrinsicWidth() > 0 ? d.getIntrinsicWidth() : 160);
            int h = Math.max(1, d.getIntrinsicHeight() > 0 ? d.getIntrinsicHeight() : 160);
            bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, w, h);
            d.draw(c);
        }
        if (bmp.getWidth() > maxW) {
            int h = Math.round(bmp.getHeight() * (maxW / (float) bmp.getWidth()));
            bmp = Bitmap.createScaledBitmap(bmp, maxW, Math.max(1, h), true);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return out.toByteArray();
    }

    @Override
    public boolean launchApp(String pkg) {
        PackageManager pm = ctx.getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) return false;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            ctx.startActivity(i);
            Events.add("Abrindo app: " + pkg);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public boolean uninstallApp(String pkg) {
        try {
            Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public boolean openStorePage(String pkg) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override public boolean mirrorActive() { return MirrorServer.isActive(); }
    @Override public boolean mirrorStop() { return MirrorServer.stopActive(); }

    @Override
    public void beep() {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_MUSIC, 100);
                tg.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 2500);
                new Handler(Looper.getMainLooper()).postDelayed(tg::release, 3000);
            } catch (Exception ignored) {
            }
            Events.add("Encontrar minha TV: tocando um som");
        });
    }
}
