package com.pereiranord.tvdrop;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.List;

/**
 * Everything the HTTP server needs from the TV. AndroidTvHost implements it on
 * the device; the tests use a fake, so every route can be checked on a plain JVM.
 */
public interface TvHost {
    // ---- device ----
    String ip();
    String deviceName();
    String model();
    int sdk();
    String androidRelease();
    String appVersion();
    /** Bytes of a bundled web file (assets/web/...), or null if there is none. */
    byte[] webAsset(String name) throws IOException;

    // ---- files and the built-in player (TV Drop 1.0) ----
    File inbox();
    void play(String src);
    /** Plays from {@code startMs} (resume). */
    void play(String src, long startMs);
    void install(File apk) throws IOException;
    boolean canInstall();
    boolean canOverlay();
    String nowPlaying();
    long position();
    long duration();
    boolean paused();
    String audioInfo();
    boolean playerControl(String cmd, long arg);
    String externalPlayerName();
    /** Audio and subtitle tracks of what is playing, plus speed: {"audio":[..],"text":[..],"speed":1.0}, or null. */
    JSONObject playerTracks();
    /** type "audio" or "text"; track -1 turns subtitles off. */
    boolean playerSelectTrack(String type, int group, int track);
    boolean playerSpeed(float speed);

    /** System volume: "up", "down" or "mute". */
    void volume(String action);

    // ---- remote control (TV Drop 2.0) ----
    RemoteControl remote();

    // ---- apps ----
    List<AppInfo> apps();
    /** PNG of the app's banner or icon, or null. */
    byte[] appIcon(String pkg);
    boolean launchApp(String pkg);
    boolean uninstallApp(String pkg);
    boolean openStorePage(String pkg);

    /** Screen mirroring from a phone (TV Drop 2.1). */
    boolean mirrorActive();
    boolean mirrorStop();

    // ---- storage (TV Drop 2.3) ----
    /** Disks: [{"name","total","free","removable"}], internal storage first. */
    org.json.JSONArray storageVolumes();
    /** {"permission":bool,"apps":[{"pkg","label","app","data","cache"}]} (needs usage access on the TV). */
    JSONObject appSizes();
    /** Empties TV Drop's own cache; returns the bytes freed. */
    long clearOwnCache();
    /** Opens the app's system settings page on the TV (where its cache/data can be cleared). */
    boolean openAppSettings(String pkg);

    // ---- media extras (TV Drop 2.5) ----
    /** JPEG thumbnail of a video/image (local path or URL), or null. */
    byte[] thumbnail(String path);
    /** Duration in ms, or -1 when unknown. */
    long mediaDuration(String path);
    /** What another app is playing (Netflix, YouTube...): {"app","title","artist","playing","position","duration"}; {"available":false,"reason"} when unknown. */
    JSONObject externalMedia();
    byte[] externalArt();
    /** play | pause | toggle | next | prev | seek (ms) on the other app's media session. */
    boolean externalControl(String action, long ms);
    /** JPEG of the TV screen (Android 11+ with the accessibility service), or null. */
    byte[] screenshot();
    /** Photo slideshow on the TV; returns null on success or the reason it failed. */
    String slideshow(List<String> paths, int seconds, String musicPath);
    boolean slideshowStop();
    /** PDF presentation on the TV; returns null on success or the reason. */
    String present(String path);
    /** next | prev | goto(page) | stop; returns the state {"file","page","pages"} or null when none. */
    JSONObject presentControl(String action, int page);
    JSONObject presentState();
    /** One page as JPEG (for the phone's preview). */
    byte[] presentPage(int page);
    /** Loads an external .srt/.vtt into the TV Drop player. */
    boolean playerSubtitle(String path);
    /** Free bytes where received files are stored (-1 when unknown). */
    long freeSpace();

    // ---- party games ----
    /** Shows the games screen (a page served by this app). Returns null on success or the reason it failed. */
    String openGames(String url);
    void closeGames();
    /** PNG of a QR code, or null when it can't be drawn. */
    byte[] qrPng(String text, int size);

    /** Plays a short sound so the TV can be found. */
    void beep();

    final class AppInfo {
        public final String pkg;
        public final String label;
        public final boolean system;

        public AppInfo(String pkg, String label, boolean system) {
            this.pkg = pkg;
            this.label = label;
            this.system = system;
        }
    }

    /**
     * Key presses, text and pointer for the TV, through whatever path the TV
     * offers (Android TV Remote protocol, accessibility service, media keys).
     * Methods return null on success, or a message saying why it can't be done.
     */
    interface RemoteControl {
        JSONObject capabilities();
        String key(String name);
        String text(String text, boolean replace, boolean submit);
        String pointer(String action, float dx, float dy);
        String pairStart();
        String pairFinish(String code);
        String unpair();
        String launchLink(String link);
    }
}
