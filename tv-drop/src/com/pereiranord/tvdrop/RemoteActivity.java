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

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Phone: the TV Drop 2.0 interface (served by the TV) in a WebView, so the
 * browser and the app share one interface. Adds native extras the browser can't
 * offer on the TV's http page: voice recognition and casting a file from the phone.
 */
public class RemoteActivity extends Activity {
    static final String EXTRA_TV = "tv", EXTRA_TOKEN = "token";
    private static final int REQ_VOICE = 10, REQ_PICK = 11, REQ_MIRROR = 12, REQ_PICK_QUEUE = 13;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private String tv, token;
    private com.pereiranord.tvdrop.atv.AtvRemote atv;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        tv = getIntent().getStringExtra(EXTRA_TV);
        token = getIntent().getStringExtra(EXTRA_TOKEN);
        if (tv == null) {
            finish();
            return;
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#121417"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        final String origin = "http://" + tv;
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                // Stay on the TV's pages; anything else opens outside the app.
                if (r.getUrl().toString().startsWith(origin + "/")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl()));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "TVDropNative");
        setContentView(web);
        web.loadUrl(origin + "/" + (token != null ? "#token=" + Uri.encode(token) : ""));
    }

    /** window.TVDropNative in the page. Only the TV's own page is ever loaded in this WebView. */
    final class Bridge {
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
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        io.shutdown();
        super.onDestroy();
    }
}
