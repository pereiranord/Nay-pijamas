package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** A TV that records what it was asked to do. */
class FakeHost implements TvHost {
    final File inbox;
    final List<String> played = new ArrayList<>();
    final List<String> installed = new ArrayList<>();
    final List<String> volume = new ArrayList<>();
    final List<String> controls = new ArrayList<>();
    final List<String> launched = new ArrayList<>();
    final List<String> uninstalled = new ArrayList<>();
    final FakeRemote remote = new FakeRemote();
    String playing;
    int beeps;

    FakeHost(File inbox) {
        this.inbox = inbox;
    }

    @Override public String ip() { return "192.168.18.31"; }
    @Override public String deviceName() { return "TV Drop (Test TV)"; }
    @Override public String model() { return "Test TV"; }
    @Override public int sdk() { return 31; }
    @Override public String androidRelease() { return "12"; }
    @Override public String appVersion() { return "2.0-test"; }

    @Override
    public byte[] webAsset(String name) {
        if (name.equals("index.html")) return "<!doctype html><title>TV Drop</title>".getBytes(StandardCharsets.UTF_8);
        if (name.equals("app.js")) return "console.log(1)".getBytes(StandardCharsets.UTF_8);
        if (name.equals("jogos.html")) return "<!doctype html><title>Jogos</title>".getBytes(StandardCharsets.UTF_8);
        return null;
    }

    @Override public File inbox() { return inbox; }
    @Override public void play(String src) { played.add(src); playing = src; }
    @Override public void play(String src, long startMs) { play(src + (startMs > 0 ? "@" + startMs : "")); }
    float speed = 1f;
    String selected;

    @Override
    public JSONObject playerTracks() {
        if (playing == null) return null;
        try {
            return new JSONObject().put("speed", speed)
                    .put("audio", new JSONArray().put(new JSONObject().put("group", 0).put("track", 0).put("label", "DTS 5.1").put("selected", true)))
                    .put("text", new JSONArray().put(new JSONObject().put("group", 1).put("track", 0).put("label", "Português").put("selected", false)));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Override public boolean playerSelectTrack(String type, int group, int track) { if (playing == null) return false; selected = type + ":" + group + ":" + track; return true; }
    @Override public boolean playerSpeed(float s) { if (playing == null) return false; speed = s; return true; }
    @Override public void install(File apk) { installed.add(apk.getName()); }
    @Override public boolean canInstall() { return true; }
    @Override public boolean canOverlay() { return false; }
    @Override public String nowPlaying() { return playing; }
    @Override public long position() { return playing == null ? 0 : 1000; }
    @Override public long duration() { return playing == null ? 0 : 60000; }
    @Override public boolean paused() { return false; }
    @Override public String audioInfo() { return playing == null ? "" : "AAC estéreo"; }

    @Override
    public boolean playerControl(String cmd, long arg) {
        if (playing == null) return false;
        controls.add(cmd + (arg != 0 ? ":" + arg : ""));
        return true;
    }

    @Override public String externalPlayerName() { return ""; }
    @Override public void volume(String action) { volume.add(action); }
    @Override public RemoteControl remote() { return remote; }

    @Override
    public List<AppInfo> apps() {
        return Arrays.asList(
                new AppInfo("com.netflix.ninja", "Netflix", false),
                new AppInfo("com.example.globo", "Globoplay", false),
                new AppInfo("com.android.tv.settings", "Configurações", true));
    }

    @Override
    public byte[] appIcon(String pkg) {
        return pkg.equals("com.netflix.ninja") ? new byte[]{(byte) 0x89, 'P', 'N', 'G'} : null;
    }

    @Override public boolean launchApp(String pkg) { launched.add(pkg); return true; }
    @Override public boolean uninstallApp(String pkg) { uninstalled.add(pkg); return true; }
    @Override public boolean openStorePage(String pkg) { return true; }
    @Override public void beep() { beeps++; }
    // ---- media extras ----
    long free = 10_000_000_000L;
    final List<String> media = new ArrayList<>();
    @Override public byte[] thumbnail(String path) { return path.endsWith(".mp4") || path.endsWith(".jpg") ? new byte[]{(byte) 0xFF, (byte) 0xD8, 1} : null; }
    @Override public long mediaDuration(String path) { return path.endsWith(".mp4") ? 125_000 : -1; }
    @Override public JSONObject externalMedia() {
        try { return new JSONObject().put("available", true).put("app", "com.netflix.ninja").put("title", "Série X").put("artist", "T1 E2").put("playing", true).put("position", 60_000).put("duration", 2_400_000); }
        catch (Exception e) { throw new RuntimeException(e); }
    }
    @Override public byte[] externalArt() { return new byte[]{1, 2}; }
    @Override public boolean externalControl(String action, long ms) { media.add("ext:" + action + (ms > 0 ? ":" + ms : "")); return true; }
    @Override public byte[] screenshot() { return new byte[]{(byte) 0xFF, (byte) 0xD8, 9}; }
    @Override public String slideshow(List<String> paths, int seconds, String music) { media.add("slides:" + paths.size() + ":" + seconds + ":" + (music != null)); return null; }
    @Override public boolean slideshowStop() { media.add("slides:stop"); return true; }
    int page = -1;
    @Override public String present(String path) { if (!path.endsWith(".pdf")) return "não é PDF"; page = 0; media.add("present:" + new File(path).getName()); return null; }
    @Override public JSONObject presentControl(String action, int p) {
        if (page < 0) return null;
        if (action.equals("next")) page = Math.min(9, page + 1); else if (action.equals("prev")) page = Math.max(0, page - 1);
        else if (action.equals("goto")) page = Math.max(0, Math.min(9, p)); else if (action.equals("stop")) { page = -1; return null; }
        return presentState();
    }
    @Override public JSONObject presentState() {
        try { return page < 0 ? null : new JSONObject().put("file", "slides.pdf").put("page", page).put("pages", 10); } catch (Exception e) { throw new RuntimeException(e); }
    }
    @Override public byte[] presentPage(int p) { return page < 0 ? null : new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) p}; }
    @Override public boolean playerSubtitle(String path) { if (playing == null) return false; media.add("sub:" + new File(path).getName()); return true; }
    @Override public long freeSpace() { return free; }
    String gamesUrl;
    @Override public String openGames(String url) { gamesUrl = url; return null; }
    @Override public void closeGames() { gamesUrl = null; }
    @Override public byte[] qrPng(String text, int size) { return null; }
    long cacheBytes = 5_000_000;
    @Override public org.json.JSONArray storageVolumes() {
        try {
            return new org.json.JSONArray()
                    .put(new JSONObject().put("name", "Armazenamento interno").put("total", 8_000_000_000L).put("free", 1_500_000_000L).put("removable", false))
                    .put(new JSONObject().put("name", "Pendrive").put("total", 32_000_000_000L).put("free", 30_000_000_000L).put("removable", true));
        } catch (Exception e) { throw new RuntimeException(e); }
    }
    @Override public JSONObject appSizes() {
        try {
            return new JSONObject().put("permission", true).put("apps", new JSONArray()
                    .put(new JSONObject().put("pkg", "com.netflix.ninja").put("label", "Netflix").put("app", 120_000_000L).put("data", 900_000_000L).put("cache", 300_000_000L))
                    .put(new JSONObject().put("pkg", "com.example.globo").put("label", "Globoplay").put("app", 80_000_000L).put("data", 50_000_000L).put("cache", 20_000_000L)));
        } catch (Exception e) { throw new RuntimeException(e); }
    }
    @Override public long clearOwnCache() { long c = cacheBytes; cacheBytes = 0; return c; }
    final List<String> settingsOpened = new ArrayList<>();
    @Override public boolean openAppSettings(String pkg) { settingsOpened.add(pkg); return true; }
    boolean mirroring;
    @Override public boolean mirrorActive() { return mirroring; }
    @Override public boolean mirrorStop() { boolean was = mirroring; mirroring = false; return was; }

    /** Remote that accepts the D-pad and refuses power (like a TV without remote pairing). */
    static class FakeRemote implements RemoteControl {
        final List<String> keys = new ArrayList<>();
        final List<String> texts = new ArrayList<>();
        final List<String> pointer = new ArrayList<>();
        String pairedCode;

        @Override
        public JSONObject capabilities() {
            try {
                return new JSONObject().put("keys", new JSONArray(Arrays.asList("up", "down", "ok", "back")))
                        .put("text", true).put("pointer", true).put("power", false);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }

        @Override
        public String key(String name) {
            if (Keys.get(name) == null) return "Tecla desconhecida: " + name;
            if (name.equals("power")) return "Esta tecla precisa do pareamento do controle.";
            keys.add(name);
            return null;
        }

        @Override
        public String text(String text, boolean replace, boolean submit) {
            texts.add(text + (replace ? "|replace" : "") + (submit ? "|submit" : ""));
            return null;
        }

        @Override
        public String pointer(String action, float dx, float dy) {
            pointer.add(action + ":" + (int) dx + "," + (int) dy);
            return null;
        }

        @Override public String pairStart() { return null; }

        @Override
        public String pairFinish(String code) {
            if (!"ABC123".equals(code)) return "Código incorreto";
            pairedCode = code;
            return null;
        }

        @Override public String unpair() { pairedCode = null; return null; }
        @Override public String launchLink(String link) { keys.add("link:" + link); return null; }
    }
}
