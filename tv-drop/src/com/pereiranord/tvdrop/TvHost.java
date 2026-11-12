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
