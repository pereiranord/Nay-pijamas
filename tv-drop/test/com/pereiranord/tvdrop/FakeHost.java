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
        return null;
    }

    @Override public File inbox() { return inbox; }
    @Override public void play(String src) { played.add(src); playing = src; }
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
