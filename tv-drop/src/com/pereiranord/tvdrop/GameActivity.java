package com.pereiranord.tvdrop;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

/**
 * TV: the party games screen. The games are a web page served by this app
 * (assets/web/jogos-tv.html) and shown here in a WebView; the phones talk to it
 * through the room in GameHub. The TV remote works too: arrows, OK and Back.
 */
public class GameActivity extends Activity {
    static final String EXTRA_URL = "url";
    private static volatile GameActivity current;
    private WebView web;
    private String url;
    private long lastBack;

    static void launch(Context ctx, String url) {
        ctx.startActivity(new Intent(ctx, GameActivity.class).putExtra(EXTRA_URL, url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        Events.add("Jogos abertos na TV");
    }

    static boolean stop() {
        final GameActivity a = current;
        if (a == null) return false;
        a.runOnUiThread(a::finish);
        return true;
    }

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        current = this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try {
            web = new WebView(this);
        } catch (Exception e) {
            // a few TVs ship without the WebView component
            TextView t = new TextView(this);
            t.setText("Esta TV não tem o componente WebView do Android, necessário para os jogos.");
            t.setTextSize(22);
            t.setTextColor(Color.WHITE);
            t.setGravity(Gravity.CENTER);
            t.setBackgroundColor(Color.parseColor("#0d0b1e"));
            setContentView(t);
            return;
        }
        web.setBackgroundColor(Color.parseColor("#0d0b1e"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // game sounds start without a tap
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "TVHost");
        web.setFocusable(true);
        setContentView(web);
        load(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        load(intent);
    }

    private void load(Intent intent) {
        String u = intent.getStringExtra(EXTRA_URL);
        if (web == null || u == null || u.equals(url) || !u.startsWith("http://127.0.0.1:")) return;
        url = u;
        web.loadUrl(u);
    }

    /** The remote's keys go to the page as simple names; the page decides what they do. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (web == null) return super.dispatchKeyEvent(e);
        String k = null;
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: k = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: k = "down"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: k = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: k = "right"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: k = "ok"; break;
            default: break;
        }
        if (k == null) return super.dispatchKeyEvent(e);
        if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
            web.evaluateJavascript("window.tvKey&&tvKey('" + k + "')", null);
        }
        return true;
    }

    @Override
    public void onBackPressed() {
        if (web == null) { finish(); return; }
        // the page handles Back (leave a match, confirm exit); twice in a row always exits
        long now = System.currentTimeMillis();
        if (now - lastBack < 1500) { finish(); return; }
        lastBack = now;
        web.evaluateJavascript("(window.tvKey&&tvKey('back'))===true", v -> {
            if (!"true".equals(v)) Toast.makeText(this, "Aperte Voltar de novo para sair dos jogos", Toast.LENGTH_SHORT).show();
            else lastBack = 0;
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
        }
        HttpServer s = ServerService.server();
        if (s != null) s.games.close();
        super.onDestroy();
    }

    private final class Bridge {
        @JavascriptInterface
        public void exit() {
            runOnUiThread(GameActivity.this::finish);
        }
    }
}
