package com.pereiranord.tvdrop;

import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.SystemClock;
import android.view.KeyEvent;

import com.pereiranord.tvdrop.atv.AtvRemote;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.Map;

/**
 * Sends remote-control commands to the TV this app runs on, choosing the best
 * path for each:
 *  1. Android TV Remote protocol (the TV's own remote service, reached on this
 *     same device once paired): every key, power, typing, app links;
 *  2. TV Drop's accessibility service, if turned on: Back/Home, D-pad on
 *     Android 13+, typing into the focused field, touchpad cursor;
 *  3. media keys and volume through AudioManager, which any app may send.
 * When none can do it, it says so instead of pretending.
 */
final class AndroidRemote implements TvHost.RemoteControl {
    private final Context ctx;
    private final AtvRemote atv;
    private volatile long lastProbe;
    private volatile boolean serviceUp;

    AndroidRemote(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.atv = new AtvRemote(new File(this.ctx.getFilesDir(), "atv-client.p12"),
                new PrefsStore(this.ctx, "atvremote"), "TV Drop",
                Arrays.asList("127.0.0.1", Actions.ip()));
    }

    private boolean atvPaired() {
        return atv.isPaired();
    }

    private boolean serviceAvailable() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastProbe > 30_000) {
            serviceUp = atv.serviceAvailable();
            lastProbe = now;
        }
        return serviceUp;
    }

    // ---- capabilities ----

    @Override
    public JSONObject capabilities() {
        TvDropAccessibility acc = TvDropAccessibility.get();
        boolean paired = atvPaired();
        int sdk = Build.VERSION.SDK_INT;
        JSONArray keys = new JSONArray();
        JSONObject via = new JSONObject();
        try {
            for (Map.Entry<String, Keys.Key> e : Keys.all().entrySet()) {
                String path = pathFor(e.getValue(), paired, acc, sdk);
                if (path != null) {
                    keys.put(e.getKey());
                    via.put(e.getKey(), path);
                }
            }
            String textPath = paired ? "remote" : acc != null ? "accessibility" : null;
            return new JSONObject()
                    .put("keys", keys)
                    .put("via", via)
                    .put("text", textPath != null)
                    .put("textVia", textPath == null ? JSONObject.NULL : textPath)
                    .put("pointer", acc != null)
                    .put("power", paired)
                    .put("links", true)
                    .put("atv", new JSONObject()
                            .put("available", serviceAvailable())
                            .put("paired", paired)
                            .put("connected", atv.isConnected())
                            .put("on", atv.isOn())
                            .put("currentApp", atv.currentApp())
                            .put("lastError", atv.lastError() == null ? JSONObject.NULL : atv.lastError()))
                    .put("accessibility", new JSONObject()
                            .put("enabled", acc != null)
                            .put("dpad", acc != null && sdk >= 33)
                            .put("enableCommand", "adb shell settings put secure enabled_accessibility_services "
                                    + "com.pereiranord.tvdrop/.TvDropAccessibility && adb shell settings put secure accessibility_enabled 1"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** Which path would carry this key right now, or null if none can. */
    static String pathFor(Keys.Key k, boolean paired, TvDropAccessibility acc, int sdk) {
        if (k.name.equals("volup") || k.name.equals("voldown") || k.name.equals("mute")) return "system";
        if (paired) return "remote";
        if (acc != null && k.globalAction != Keys.GA_NONE && sdk >= k.globalActionSdk) return "accessibility";
        if (k.media) return "media";
        return null;
    }

    // ---- keys ----

    @Override
    public String key(String name) {
        Keys.Key k = Keys.get(name);
        if (k == null) return "Tecla desconhecida: " + name;
        AudioManager am = ctx.getSystemService(AudioManager.class);
        switch (k.name) {
            case "volup": am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI); return null;
            case "voldown": am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI); return null;
            case "mute": am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_TOGGLE_MUTE, AudioManager.FLAG_SHOW_UI); return null;
            default: break;
        }
        String atvError = null;
        if (atvPaired()) {
            try {
                atv.sendKey(k.keyCode);
                return null;
            } catch (IOException | IllegalStateException e) {
                atvError = e.getMessage();
            }
        }
        TvDropAccessibility acc = TvDropAccessibility.get();
        if (acc != null && k.globalAction != Keys.GA_NONE && Build.VERSION.SDK_INT >= k.globalActionSdk) {
            if (acc.global(k.globalAction)) return null;
        }
        if (k.media) {
            long t = SystemClock.uptimeMillis();
            am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, k.keyCode, 0));
            am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_UP, k.keyCode, 0));
            return null;
        }
        if (atvError != null) return "A TV não respondeu ao controle: " + atvError;
        return "Esta tecla precisa do pareamento do controle (Dispositivos → Parear controle).";
    }

    // ---- text ----

    @Override
    public String text(String text, boolean replace, boolean submit) {
        if (text == null) text = "";
        String atvError = null;
        if (atvPaired()) {
            try {
                if (!text.isEmpty()) {
                    if (atv.imeReady()) atv.sendText(text);
                    else typeKeys(text);
                }
                if (submit) atv.sendKey(66);
                return null;
            } catch (IOException | IllegalStateException | IllegalArgumentException e) {
                atvError = e.getMessage();
            }
        }
        TvDropAccessibility acc = TvDropAccessibility.get();
        if (acc != null) {
            String err = text.isEmpty() && !replace ? null : acc.setText(text, replace);
            if (err == null && submit) acc.submit();
            return err;
        }
        if (atvError != null) return "A TV não respondeu ao controle: " + atvError;
        return "Para digitar na TV, pareie o controle (Dispositivos) ou ative a acessibilidade do TV Drop.";
    }

    /** When the TV doesn't report a text field, types key by key (lowercase letters, digits, space, . , - @ /). */
    private void typeKeys(String text) throws IOException {
        String t = text.toLowerCase(java.util.Locale.ROOT);
        for (char c : t.toCharArray()) {
            int code = Keys.charKey(Normalizer.strip(c));
            if (code == 0) throw new IllegalArgumentException("A TV não informou o campo de texto e o caractere \"" + c + "\" não tem tecla.");
        }
        for (char c : t.toCharArray()) atv.sendKey(Keys.charKey(Normalizer.strip(c)));
    }

    // ---- pointer ----

    @Override
    public String pointer(String action, float dx, float dy) {
        TvDropAccessibility acc = TvDropAccessibility.get();
        if (acc == null) return "O touchpad precisa da acessibilidade do TV Drop ativada na TV.";
        return acc.pointer(action, dx, dy);
    }

    // ---- pairing with the TV's remote service ----

    @Override
    public String pairStart() {
        try {
            atv.startPairing();
            Events.add("Pareando o controle: veja o código na tela da TV");
            return null;
        } catch (IOException e) {
            return "Não consegui falar com o serviço de controle da TV (" + e.getMessage()
                    + "). Ele existe no Google TV/Android TV com o app \"Android TV Remote Service\".";
        }
    }

    @Override
    public String pairFinish(String code) {
        try {
            atv.finishPairing(code);
            Events.add("Controle pareado com a TV");
            lastProbe = 0;
            return null;
        } catch (IllegalArgumentException | IllegalStateException e) {
            return e.getMessage();
        } catch (IOException e) {
            return "A TV recusou o código: " + e.getMessage();
        }
    }

    @Override
    public String unpair() {
        atv.unpair();
        return null;
    }

    @Override
    public String launchLink(String link) {
        if (atvPaired()) {
            try {
                atv.launchLink(link);
                return null;
            } catch (IOException | IllegalStateException ignored) {
                // fall back to a normal VIEW intent below
            }
        }
        try {
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(link));
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            return null;
        } catch (Exception e) {
            return "Nenhum app da TV abre este link.";
        }
    }

    /** Folds accented letters to plain ones for key-by-key typing (á -> a, ç -> c). */
    static final class Normalizer {
        static char strip(char c) {
            String s = java.text.Normalizer.normalize(String.valueOf(c), java.text.Normalizer.Form.NFD)
                    .replaceAll("\\p{M}", "");
            return s.isEmpty() ? c : s.charAt(0);
        }
    }
}
