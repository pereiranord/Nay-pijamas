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
    private static final int REQ_VOICE = 10, REQ_PICK = 11;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private String tv;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        tv = getIntent().getStringExtra(EXTRA_TV);
        String token = getIntent().getStringExtra(EXTRA_TOKEN);
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

        @JavascriptInterface
        public void pickAndCast() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"});
                startActivityForResult(i, REQ_PICK);
            });
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
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
