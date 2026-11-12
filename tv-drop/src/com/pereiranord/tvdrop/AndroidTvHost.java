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
    /** -1 = continue from where it stopped (when known), 0 = from the start, >0 = that position. */
    @Override public void play(String src) { Actions.play(ctx, src, -1); }
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

    // ---- storage ----

    @Override
    public org.json.JSONArray storageVolumes() {
        org.json.JSONArray out = new org.json.JSONArray();
        java.util.Set<String> seen = new java.util.HashSet<>();
        try {
            android.os.StatFs data = new android.os.StatFs(android.os.Environment.getDataDirectory().getPath());
            out.put(new JSONObject().put("name", "Armazenamento interno").put("total", data.getTotalBytes())
                    .put("free", data.getAvailableBytes()).put("removable", false));
            seen.add(data.getTotalBytes() + ":" + data.getAvailableBytes());
            // USB drives / SD cards: one app-specific dir per mounted volume
            for (File dir : ctx.getExternalFilesDirs(null)) {
                if (dir == null) continue;
                try {
                    if (!android.os.Environment.isExternalStorageRemovable(dir)) continue;
                    android.os.StatFs st = new android.os.StatFs(dir.getPath());
                    if (!seen.add(st.getTotalBytes() + ":" + st.getAvailableBytes())) continue;
                    out.put(new JSONObject().put("name", "Pendrive / cartão").put("total", st.getTotalBytes())
                            .put("free", st.getAvailableBytes()).put("removable", true));
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    @Override
    public JSONObject appSizes() {
        JSONObject res = new JSONObject();
        org.json.JSONArray list = new org.json.JSONArray();
        boolean permission = true;
        try {
            android.app.usage.StorageStatsManager ssm = ctx.getSystemService(android.app.usage.StorageStatsManager.class);
            android.os.UserHandle me = android.os.Process.myUserHandle();
            java.util.List<JSONObject> rows = new ArrayList<>();
            for (AppInfo a : apps()) {
                try {
                    android.app.usage.StorageStats st = ssm.queryStatsForPackage(android.os.storage.StorageManager.UUID_DEFAULT, a.pkg, me);
                    rows.add(new JSONObject().put("pkg", a.pkg).put("label", a.label).put("app", st.getAppBytes())
                            .put("data", st.getDataBytes()).put("cache", st.getCacheBytes()));
                } catch (SecurityException se) {
                    permission = false;
                    break;
                } catch (Exception ignored) {
                }
            }
            Collections.sort(rows, (x, y) -> Long.compare(y.optLong("app") + y.optLong("data"), x.optLong("app") + x.optLong("data")));
            for (JSONObject r : rows) list.put(r);
            res.put("permission", permission).put("apps", permission ? list : new org.json.JSONArray())
                    .put("enableCommand", "adb shell appops set " + ctx.getPackageName() + " GET_USAGE_STATS allow");
        } catch (Exception e) {
            try { res.put("permission", false).put("apps", new org.json.JSONArray()); } catch (Exception ignored) {}
        }
        return res;
    }

    @Override
    public long clearOwnCache() {
        return deleteTree(ctx.getCacheDir(), false) + (ctx.getExternalCacheDir() != null ? deleteTree(ctx.getExternalCacheDir(), false) : 0);
    }

    private static long deleteTree(File f, boolean self) {
        long freed = 0;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) freed += deleteTree(k, true);
        if (self) {
            long len = f.isFile() ? f.length() : 0;
            if (f.delete()) freed += len;
        }
        return freed;
    }

    @Override
    public boolean openAppSettings(String pkg) {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ---- media extras ----

    @Override
    public byte[] thumbnail(String path) {
        try {
            Bitmap bmp;
            if ("image".equals(HttpServer.kind(path))) {
                android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                android.graphics.BitmapFactory.decodeFile(path, o);
                int sample = 1;
                while (o.outWidth / (sample * 2) >= 320) sample *= 2;
                o = new android.graphics.BitmapFactory.Options();
                o.inSampleSize = sample;
                bmp = android.graphics.BitmapFactory.decodeFile(path, o);
            } else {
                android.media.MediaMetadataRetriever r = new android.media.MediaMetadataRetriever();
                try {
                    if (path.startsWith("/")) r.setDataSource(path);
                    else r.setDataSource(path, new java.util.HashMap<>());
                    long dur = parseLong(r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));
                    long at = dur > 0 ? Math.min(dur / 10, 60_000) * 1000 : 5_000_000;
                    bmp = Build.VERSION.SDK_INT >= 27
                            ? r.getScaledFrameAtTime(at, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 320, 180)
                            : r.getFrameAtTime(at);
                } finally {
                    r.release();
                }
            }
            if (bmp == null) return null;
            if (bmp.getWidth() > 320) bmp = Bitmap.createScaledBitmap(bmp, 320, Math.max(1, Math.round(bmp.getHeight() * 320f / bmp.getWidth())), true);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 78, out);
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public long mediaDuration(String path) {
        android.media.MediaMetadataRetriever r = new android.media.MediaMetadataRetriever();
        try {
            if (path.startsWith("/")) r.setDataSource(path);
            else r.setDataSource(path, new java.util.HashMap<>());
            long d = parseLong(r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));
            return d > 0 ? d : -1;
        } catch (Exception e) {
            return -1;
        } finally {
            try { r.release(); } catch (Exception ignored) {}
        }
    }

    private static long parseLong(String s) {
        try { return s == null ? -1 : Long.parseLong(s); } catch (NumberFormatException e) { return -1; }
    }

    /** The media session of another app (needs notification access for TV Drop). */
    private android.media.session.MediaController activeSession() {
        android.media.session.MediaSessionManager msm = ctx.getSystemService(android.media.session.MediaSessionManager.class);
        java.util.List<android.media.session.MediaController> list =
                msm.getActiveSessions(new android.content.ComponentName(ctx, MediaListener.class));
        android.media.session.MediaController best = null;
        for (android.media.session.MediaController c : list) {
            if (c.getPackageName().equals(ctx.getPackageName())) continue;
            android.media.session.PlaybackState st = c.getPlaybackState();
            if (st != null && st.getState() == android.media.session.PlaybackState.STATE_PLAYING) return c;
            if (best == null) best = c;
        }
        return best;
    }

    @Override
    public JSONObject externalMedia() {
        JSONObject o = new JSONObject();
        try {
            android.media.session.MediaController c;
            try {
                c = activeSession();
            } catch (SecurityException se) {
                return o.put("available", false).put("reason", "permission")
                        .put("enableCommand", "adb shell cmd notification allow_listener " + ctx.getPackageName() + "/" + MediaListener.class.getName());
            }
            if (c == null) return o.put("available", false).put("reason", "idle");
            android.media.MediaMetadata md = c.getMetadata();
            android.media.session.PlaybackState st = c.getPlaybackState();
            String title = md == null ? null : md.getString(android.media.MediaMetadata.METADATA_KEY_TITLE);
            if (title == null && md != null) title = md.getString(android.media.MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
            String artist = md == null ? null : md.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST);
            if (artist == null && md != null) artist = md.getString(android.media.MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE);
            long duration = md == null ? -1 : md.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION);
            boolean playing = st != null && st.getState() == android.media.session.PlaybackState.STATE_PLAYING;
            long pos = st == null ? -1 : st.getPosition();
            if (playing && st.getLastPositionUpdateTime() > 0) {
                pos += (long) ((android.os.SystemClock.elapsedRealtime() - st.getLastPositionUpdateTime()) * st.getPlaybackSpeed());
            }
            String label = c.getPackageName();
            try {
                label = ctx.getPackageManager().getApplicationLabel(ctx.getPackageManager().getApplicationInfo(c.getPackageName(), 0)).toString();
            } catch (Exception ignored) {
            }
            boolean art = md != null && (md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ART) != null
                    || md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART) != null);
            return o.put("available", true).put("app", c.getPackageName()).put("appLabel", label)
                    .put("title", title == null ? JSONObject.NULL : title).put("artist", artist == null ? JSONObject.NULL : artist)
                    .put("playing", playing).put("position", Math.max(-1, pos)).put("duration", duration).put("art", art);
        } catch (Exception e) {
            try { return o.put("available", false).put("reason", "error"); } catch (Exception ignored) { return o; }
        }
    }

    @Override
    public byte[] externalArt() {
        try {
            android.media.session.MediaController c = activeSession();
            if (c == null || c.getMetadata() == null) return null;
            Bitmap b = c.getMetadata().getBitmap(android.media.MediaMetadata.METADATA_KEY_ART);
            if (b == null) b = c.getMetadata().getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART);
            if (b == null) return null;
            if (b.getWidth() > 480) b = Bitmap.createScaledBitmap(b, 480, Math.max(1, Math.round(b.getHeight() * 480f / b.getWidth())), true);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public boolean externalControl(String action, long ms) {
        try {
            android.media.session.MediaController c = activeSession();
            if (c == null) return false;
            android.media.session.MediaController.TransportControls t = c.getTransportControls();
            android.media.session.PlaybackState st = c.getPlaybackState();
            boolean playing = st != null && st.getState() == android.media.session.PlaybackState.STATE_PLAYING;
            switch (action) {
                case "play": t.play(); break;
                case "pause": t.pause(); break;
                case "toggle": if (playing) t.pause(); else t.play(); break;
                case "next": t.skipToNext(); break;
                case "prev": t.skipToPrevious(); break;
                case "seek": t.seekTo(Math.max(0, ms)); break;
                default: return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public byte[] screenshot() {
        TvDropAccessibility acc = TvDropAccessibility.get();
        return acc == null || Build.VERSION.SDK_INT < 30 ? null : acc.screenshotJpeg();
    }

    @Override
    public String slideshow(List<String> paths, int seconds, String musicPath) {
        try {
            Intent i = new Intent(ctx, SlideshowActivity.class)
                    .putStringArrayListExtra(SlideshowActivity.EXTRA_PATHS, new ArrayList<>(paths))
                    .putExtra(SlideshowActivity.EXTRA_SECONDS, seconds)
                    .putExtra(SlideshowActivity.EXTRA_MUSIC, musicPath)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            ctx.startActivity(i);
            return null;
        } catch (Exception e) {
            return "A TV não abriu o slideshow: " + e.getMessage();
        }
    }

    @Override public boolean slideshowStop() { return SlideshowActivity.stop(); }

    @Override
    public String present(String path) {
        try {
            ctx.startActivity(new Intent(ctx, PresentActivity.class).putExtra(PresentActivity.EXTRA_PATH, path)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            for (int i = 0; i < 30 && PresentActivity.state() == null; i++) Thread.sleep(100);
            return PresentActivity.state() == null ? "A TV não abriu o PDF (deixe o TV Drop aberto ou libere \"Sobrepor a outros apps\")." : null;
        } catch (Exception e) {
            return "A TV não abriu o PDF: " + e.getMessage();
        }
    }

    @Override public JSONObject presentControl(String action, int page) { return PresentActivity.control(action, page); }
    @Override public JSONObject presentState() { return PresentActivity.state(); }
    @Override public byte[] presentPage(int page) { return PresentActivity.pageJpeg(page); }
    @Override public boolean playerSubtitle(String path) { return PlayerActivity.addSubtitle(path); }

    @Override
    public long freeSpace() {
        try {
            return new android.os.StatFs(inbox().getPath()).getAvailableBytes();
        } catch (Exception e) {
            return -1;
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
