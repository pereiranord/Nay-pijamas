package com.pereiranord.tvdrop;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Phone app home screen: the TV Drop interface bundled in the APK (assets/web, the
 * same one the TV serves and the standalone index.html), in a WebView. The page
 * finds the TV through native discovery, pairs, and talks to it over the local
 * network. Native extras the browser can't offer: discovery, voice recognition,
 * casting and queueing files from the phone, screen mirroring, the phone-direct
 * remote and Android's "Share" menu. The classic 1.0 screen stays available.
 */
public class RemoteActivity extends Activity {
    static final String EXTRA_TV = "tv", EXTRA_TOKEN = "token";
    private static final int REQ_VOICE = 10, REQ_PICK = 11, REQ_MIRROR = 12, REQ_PICK_QUEUE = 13;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private String tv, token;
    private com.pereiranord.tvdrop.atv.AtvRemote atv;
    private Discovery discovery;
    private java.util.List<Uri> pendingShare;
    private String pendingLink;
    static final String HOME = "file:///android_asset/web/index.html";
    /** tvdrop://go/remote, tvdrop://shortcut/Modo%20filme, tvdrop://mirror — from launcher shortcuts. */
    private Uri pendingOpen;
    private boolean pageReady;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        tv = getIntent().getStringExtra(EXTRA_TV);
        token = getIntent().getStringExtra(EXTRA_TOKEN);
        if (token != null) Net.token = token;
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#121417"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                pageReady = true;
                deliverOpen();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                // Stay on the bundled interface or the TV's own pages; anything else opens outside the app.
                String url = r.getUrl().toString();
                if (url.startsWith("file:///android_asset/web/") || (tv != null && url.startsWith("http://" + tv + "/"))) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl()));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "TVDropNative");
        setContentView(web);
        if (getIntent().hasExtra(EXTRA_TV)) {
            // opened from the classic screen: that TV's own page, already paired
            web.loadUrl("http://" + tv + "/" + (token != null ? "#token=" + Uri.encode(token) : ""));
        } else {
            web.loadUrl(HOME);
        }
        handleShare(getIntent());
        takeOpen(getIntent());
        publishShortcuts(null);
        if (prefs().getBoolean("quickNotif", false)) QuickControls.show(this);
        if (android.os.Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 0);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent);
        takeOpen(intent);
    }

    private android.content.SharedPreferences prefs() {
        return getSharedPreferences("tvdrop_ui", MODE_PRIVATE);
    }

    // ---------- launcher shortcuts / deep links ----------

    private void takeOpen(Intent i) {
        if (i != null && i.getData() != null && "tvdrop".equals(i.getData().getScheme())) {
            pendingOpen = i.getData();
            deliverOpen();
        }
    }

    private void deliverOpen() {
        if (pendingOpen == null || !pageReady) return;
        Uri u = pendingOpen;
        pendingOpen = null;
        String kind = u.getHost() == null ? "" : u.getHost();
        String value = u.getPathSegments().isEmpty() ? "" : u.getPathSegments().get(0);
        web.evaluateJavascript("window.tvdropOpen && tvdropOpen(" + JSONObject.quote(kind) + "," + JSONObject.quote(value) + ")", null);
    }

    /** Fixed shortcuts plus the user's own "Meus atalhos" (long-press the app icon). */
    private void publishShortcuts(org.json.JSONArray userShortcuts) {
        try {
            android.content.pm.ShortcutManager sm = getSystemService(android.content.pm.ShortcutManager.class);
            if (sm == null) return;
            java.util.List<android.content.pm.ShortcutInfo> list = new ArrayList<>();
            list.add(shortcut("remote", "Controle", "tvdrop://go/remote", android.R.drawable.ic_menu_compass));
            list.add(shortcut("cast", "Transmitir", "tvdrop://go/cast", android.R.drawable.ic_menu_upload));
            list.add(shortcut("mirror", "Espelhar a tela", "tvdrop://mirror/now", android.R.drawable.ic_menu_slideshow));
            if (userShortcuts != null) {
                for (int k = 0; k < userShortcuts.length() && list.size() < sm.getMaxShortcutCountPerActivity(); k++) {
                    String name = userShortcuts.getString(k);
                    list.add(shortcut("sc" + k, name, "tvdrop://shortcut/" + Uri.encode(name), android.R.drawable.ic_media_play));
                }
            }
            sm.setDynamicShortcuts(list);
        } catch (Exception ignored) {
        }
    }

    private android.content.pm.ShortcutInfo shortcut(String id, String label, String uri, int icon) {
        return new android.content.pm.ShortcutInfo.Builder(this, id)
                .setShortLabel(label)
                .setIcon(android.graphics.drawable.Icon.createWithResource(this, icon))
                .setIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(uri), this, RemoteActivity.class))
                .build();
    }

    // ---------- phone volume keys control the TV ----------

    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent e) {
        int code = e.getKeyCode();
        boolean vol = code == android.view.KeyEvent.KEYCODE_VOLUME_UP || code == android.view.KeyEvent.KEYCODE_VOLUME_DOWN;
        if (vol && token != null && tv != null && prefs().getBoolean("volKeys", true)) {
            if (e.getAction() == android.view.KeyEvent.ACTION_DOWN) {
                // Android repeats the event while held, so holding works too
                web.evaluateJavascript("window.sendKey && sendKey('" + (code == android.view.KeyEvent.KEYCODE_VOLUME_UP ? "volup" : "voldown") + "')", null);
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // ---------- Android "Share" -> TV Drop ----------

    private void handleShare(Intent i) {
        if (i == null || i.getAction() == null) return;
        java.util.List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) {
            @SuppressWarnings("deprecation")
            ArrayList<Uri> list = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else if (Intent.ACTION_SEND.equals(i.getAction())) {
            @SuppressWarnings("deprecation")
            Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
            else {
                String text = i.getStringExtra(Intent.EXTRA_TEXT);
                if (text != null && text.matches("(?is).*https?://\\S+.*")) {
                    pendingLink = text.replaceAll("(?is).*?(https?://\\S+).*", "$1");
                    deliverLink();
                }
                return;
            }
        } else {
            return;
        }
        if (uris.isEmpty()) return;
        pendingShare = uris;
        if (tv != null && token != null) deliverShare();
        else Toast.makeText(this, "Conecte a uma TV: em seguida você escolhe o que fazer com " + (uris.size() == 1 ? "o arquivo." : uris.size() + " arquivos."), Toast.LENGTH_LONG).show();
    }

    private void deliverLink() {
        if (pendingLink == null || tv == null || token == null) return;
        String link = pendingLink;
        pendingLink = null;
        web.evaluateJavascript("window.tvdropShareLink && tvdropShareLink(" + JSONObject.quote(link) + ")", null);
    }

    /** Videos/music: play now or queue (served from the phone, no copy) or copy. Other files: copy to the TV. */
    private void deliverShare() {
        final java.util.List<Uri> uris = pendingShare;
        pendingShare = null;
        if (uris == null || uris.isEmpty()) return;
        boolean media = true;
        for (Uri u : uris) {
            String t = getContentResolver().getType(u);
            if (t == null || !(t.startsWith("video/") || t.startsWith("audio/"))) media = false;
        }
        final String target = tv;
        final boolean isMedia = media;
        String title = uris.size() == 1 ? PhoneCast.displayName(this, uris.get(0)) : uris.size() + " arquivos";
        String[] items = media
                ? new String[]{"Tocar agora na TV (sem copiar)", "Adicionar à fila da TV (sem copiar)", "Copiar para a TV (arquivos recebidos)"}
                : new String[]{"Enviar para a TV (arquivos recebidos)", "Enviar e abrir na TV (APK: instalar)"};
        new android.app.AlertDialog.Builder(this).setTitle(title).setItems(items, (d, which) -> io.execute(() -> {
            int ok = 0;
            String err = null;
            for (int k = 0; k < uris.size(); k++) {
                Uri u = uris.get(k);
                String e;
                if (isMedia && which == 0) e = k == 0 ? PhoneCast.cast(this, target, u) : PhoneCast.queue(this, target, u, "end");
                else if (isMedia && which == 1) e = PhoneCast.queue(this, target, u, "end");
                else e = PhoneCast.upload(this, target, u, !isMedia && which == 1);
                if (e == null) ok++; else err = e;
            }
            final String msg = ok + " de " + uris.size() + " concluído(s)" + (err != null ? " (" + err + ")" : "");
            runOnUiThread(() -> js("toast", msg));
        })).setNegativeButton("Cancelar", null).show();
    }

    /** window.TVDropNative in the page. Only the TV's own page is ever loaded in this WebView. */
    final class Bridge {
        /** The page tells which TV it is connected to (host:port) and its pairing token. */
        @JavascriptInterface
        public void setTv(String hostPort, String tok) {
            runOnUiThread(() -> {
                if (hostPort == null || !hostPort.matches("[A-Za-z0-9.\\-]+:\\d{2,5}")) return;
                if (!hostPort.equals(tv)) atv = null;
                tv = hostPort;
                token = tok;
                Net.token = tok;
                getSharedPreferences("tvdrop", MODE_PRIVATE).edit().putString("last", hostPort).putString("token:" + hostPort, tok).apply();
                if (pendingShare != null) deliverShare();
                deliverLink();
                // home-screen widget and notification show the connected TV
                android.appwidget.AppWidgetManager wm = android.appwidget.AppWidgetManager.getInstance(RemoteActivity.this);
                int[] ids = wm.getAppWidgetIds(new android.content.ComponentName(RemoteActivity.this, TvDropWidget.class));
                if (ids.length > 0) new TvDropWidget().onUpdate(RemoteActivity.this, wm, ids);
                if (prefs().getBoolean("quickNotif", false)) QuickControls.show(RemoteActivity.this);
            });
        }

        /** Finds TVs on the network (mDNS + subnet scan): tvdropFound({name,host,port}) for each, then tvdropDiscoveryDone(). */
        @JavascriptInterface
        public void discover() {
            runOnUiThread(() -> {
                if (discovery != null) discovery.stop();
                discovery = new Discovery(RemoteActivity.this, (name, host, port) -> runOnUiThread(() -> {
                    try {
                        JSONObject o = new JSONObject().put("name", name).put("host", host).put("port", port);
                        web.evaluateJavascript("window.tvdropFound && tvdropFound(" + o + ")", null);
                    } catch (Exception ignored) {
                    }
                }));
                discovery.start();
                web.postDelayed(() -> web.evaluateJavascript("window.tvdropDiscoveryDone && tvdropDiscoveryDone()", null), 9000);
            });
        }

        /** Settings that the native side also needs (volume keys, quick-controls notification). */
        @JavascriptInterface
        public void setPref(String key, String value) {
            boolean on = "true".equals(value);
            prefs().edit().putBoolean(key, on).apply();
            if ("quickNotif".equals(key)) runOnUiThread(() -> {
                if (on) QuickControls.show(RemoteActivity.this); else QuickControls.hide(RemoteActivity.this);
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "?";
            }
        }

        /** Google's code scanner (no camera permission needed by TV Drop): reads the QR code on the TV. */
        @JavascriptInterface
        public void scanQr() {
            runOnUiThread(() -> {
                try {
                    com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(RemoteActivity.this).startScan()
                            .addOnSuccessListener(code -> js("tvdropQr", code.getRawValue() == null ? "" : code.getRawValue()))
                            .addOnFailureListener(e -> js("toast", "Não consegui ler o QR Code: " + e.getMessage()));
                } catch (Throwable t) {
                    js("toast", "Leitor de QR Code indisponível neste celular (precisa do Google Play Services).");
                }
            });
        }

        /** The page's "Meus atalhos" become launcher shortcuts. */
        @JavascriptInterface
        public void setShortcuts(String jsonNames) {
            runOnUiThread(() -> {
                try {
                    publishShortcuts(new org.json.JSONArray(jsonNames));
                } catch (Exception ignored) {
                }
            });
        }

        /** The classic TV Drop 1.0 phone screen. */
        @JavascriptInterface
        public void classic() {
            runOnUiThread(() -> startActivity(new Intent(RemoteActivity.this, PhoneActivity.class)));
        }

        @JavascriptInterface
        public void voice() {
            runOnUiThread(() -> {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
                        .putExtra(RecognizerIntent.EXTRA_PROMPT, "Fale um comando para a TV");
                try {
                    startActivityForResult(i, REQ_VOICE);
                } catch (Exception e) {
                    js("tvdropVoiceError", "Este celular não tem reconhecimento de voz (instale o app Google).");
                }
            });
        }

        /** Screen mirroring: Android shows its own permission dialog first. */
        @JavascriptInterface
        public void mirror() {
            runOnUiThread(() -> {
                if (MirrorService.isRunning()) {
                    startService(new Intent(RemoteActivity.this, MirrorService.class).setAction(MirrorService.ACTION_STOP));
                    js("toast", "Espelhamento encerrado");
                    return;
                }
                android.media.projection.MediaProjectionManager mpm = getSystemService(android.media.projection.MediaProjectionManager.class);
                startActivityForResult(mpm.createScreenCaptureIntent(), REQ_MIRROR);
            });
        }

        @JavascriptInterface
        public boolean mirroring() {
            return MirrorService.isRunning();
        }

        /** Pick a video on the phone and add it to the TV's queue (served from the phone, not copied). */
        @JavascriptInterface
        public void pickToQueue() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"})
                        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                startActivityForResult(i, REQ_PICK_QUEUE);
            });
        }

        /**
         * Android TV Remote straight from the phone (when the TV can't reach its own remote service).
         * action: state | pairStart | pairFinish | key | text | link. The answer goes to tvdropNative(id, json).
         */
        @JavascriptInterface
        public void atv(String action, String arg, String id) {
            io.execute(() -> {
                JSONObject r = new JSONObject();
                try {
                    com.pereiranord.tvdrop.atv.AtvRemote a = phoneAtv();
                    switch (action) {
                        case "state":
                            r.put("paired", a.isPaired()).put("available", a.serviceAvailable());
                            break;
                        case "pairStart": a.startPairing(); break;
                        case "pairFinish": a.finishPairing(arg); break;
                        case "unpair": a.unpair(); break;
                        case "key": {
                            Keys.Key k = Keys.get(arg);
                            if (k == null) throw new IllegalArgumentException("Tecla desconhecida");
                            a.sendKey(k.keyCode);
                            break;
                        }
                        case "text": {
                            JSONObject t = new JSONObject(arg);
                            String text = t.optString("text");
                            if (!text.isEmpty()) {
                                if (a.imeReady()) a.sendText(text);
                                else for (char c : text.toLowerCase(java.util.Locale.ROOT).toCharArray()) {
                                    int code = Keys.charKey(AndroidRemote.Normalizer.strip(c));
                                    if (code != 0) a.sendKey(code);
                                }
                            }
                            if (t.optBoolean("submit")) a.sendKey(66);
                            break;
                        }
                        case "link": a.launchLink(arg); break;
                        default: throw new IllegalArgumentException("ação desconhecida");
                    }
                    r.put("ok", true);
                } catch (Exception e) {
                    try {
                        r.put("ok", false).put("message", e.getMessage() == null ? e.toString() : e.getMessage());
                    } catch (org.json.JSONException ignored) {
                    }
                }
                runOnUiThread(() -> web.evaluateJavascript("tvdropNative(" + JSONObject.quote(id) + "," + r + ")", null));
            });
        }

        @JavascriptInterface
        public void pickAndCast() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"});
                startActivityForResult(i, REQ_PICK);
            });
        }
    }

    /** The phone's own Android TV Remote client for this TV (separate certificate and pairing). */
    private synchronized com.pereiranord.tvdrop.atv.AtvRemote phoneAtv() {
        if (atv == null) {
            String host = tv.split(":")[0];
            atv = new com.pereiranord.tvdrop.atv.AtvRemote(new java.io.File(getFilesDir(), "atv-phone.p12"),
                    new PrefsStore(this, "atv_phone_" + host.replace('.', '_')), "TV Drop (celular)",
                    java.util.Collections.singletonList(host));
        }
        return atv;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_MIRROR) {
            if (res != RESULT_OK || data == null) { js("toast", "Espelhamento cancelado."); return; }
            Intent svc = new Intent(this, MirrorService.class)
                    .putExtra(MirrorService.EXTRA_CODE, res).putExtra(MirrorService.EXTRA_DATA, data)
                    .putExtra(MirrorService.EXTRA_TV, tv).putExtra(MirrorService.EXTRA_TOKEN, token);
            startForegroundService(svc);
            js("toast", "Espelhando a tela na TV. Para parar: notificação ou Voltar no controle da TV.");
            return;
        }
        if (req == REQ_PICK_QUEUE && res == RESULT_OK && data != null) {
            java.util.List<Uri> uris = new ArrayList<>();
            if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
            else if (data.getData() != null) uris.add(data.getData());
            io.execute(() -> {
                int ok = 0;
                String err = null;
                for (Uri u : uris) {
                    try {
                        getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {
                    }
                    String e = PhoneCast.queue(this, tv, u, "end");
                    if (e == null) ok++; else err = e;
                }
                final int n = ok;
                final String last = err;
                runOnUiThread(() -> js("toast", n + " " + (n == 1 ? "item adicionado" : "itens adicionados") + " à fila" + (last != null ? " (" + last + ")" : "")));
            });
            return;
        }
        if (req == REQ_VOICE) {
            ArrayList<String> r = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (res == RESULT_OK && r != null && !r.isEmpty()) js("tvdropVoiceResult", r.get(0));
            else js("tvdropVoiceError", "Não ouvi nenhum comando.");
        } else if (req == REQ_PICK && res == RESULT_OK && data != null && data.getData() != null) {
            Uri u = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {
            }
            js("toast", "Preparando " + PhoneCast.displayName(this, u) + "…");
            io.execute(() -> {
                String err = PhoneCast.cast(this, tv, u);
                runOnUiThread(() -> {
                    if (err == null) js("toast", "Transmitindo para a TV. Mantenha o celular no Wi-Fi.");
                    else web.evaluateJavascript("toast(" + JSONObject.quote(err) + ", false)", null);
                });
            });
        }
    }

    private void js(String fn, String arg) {
        web.evaluateJavascript(fn + "(" + JSONObject.quote(arg) + ")", null);
    }

    @Override
    public void onBackPressed() {
        // the page decides first (e.g. goes back to Início); otherwise leave the app
        web.evaluateJavascript("window.tvdropBack ? tvdropBack() : false", v -> {
            if (!"true".equals(v)) {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (discovery != null) discovery.stop();
        if (web != null) web.destroy();
        io.shutdown();
        super.onDestroy();
    }
}
