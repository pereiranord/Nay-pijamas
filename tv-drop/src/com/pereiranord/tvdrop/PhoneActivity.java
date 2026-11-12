package com.pereiranord.tvdrop;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.InputStream;
import java.net.URLEncoder;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Phone screen: finds the TV (or connects by code), then streams a video from
 * the phone to the TV without copying it, sends APKs and works as a remote.
 */
public class PhoneActivity extends Activity {
    private static final int PICK_VIDEO = 1, PICK_APK = 2;
    private static final int BG = 0xFF0F1316, CARD = 0xFF192026, ACCENT = 0xFF4FC3F7, MUTED = 0xFF93A1AD;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ExecutorService poll = Executors.newSingleThreadExecutor();
    private final Map<String, String> tvs = new LinkedHashMap<>(); // "host:port" -> name

    private Discovery discovery;
    private SharedPreferences prefs;
    private String tv;       // "host:port" when connected
    private String tvName;
    private java.util.List<Uri> pendingShare; // files shared from another app, waiting for a TV
    private final java.util.Set<String> online = new java.util.HashSet<>();
    private boolean userSeeking;
    private boolean pollQueued;

    private TextView status, msg, nowPlaying, audioView, time;
    private Button external;
    private LinearLayout tvList, controls;
    private EditText code, link;
    private SeekBar seek;

    private final Runnable pollTick = this::pollStatus;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("tvdrop", MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 0);
        buildUi();
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        handleShare(i);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (tv == null) startDiscovery();
        ui.post(pollTick);
    }

    @Override
    protected void onPause() {
        if (discovery != null) discovery.stop();
        ui.removeCallbacks(pollTick);
        super.onPause();
    }

    // ---------- connecting ----------

    private void startDiscovery() {
        if (discovery != null) discovery.stop();
        tvs.clear();
        online.clear();
        renderTvs();
        probeSaved();
        status.setText("Procurando a TV na rede…");
        discovery = new Discovery(this, (name, host, port) -> ui.post(() -> onFound(name, host, port)));
        discovery.start();
        ui.postDelayed(() -> {
            if (tv == null && tvs.isEmpty())
                status.setText("Nenhuma TV encontrada. Abra o TV Drop na TV ou digite o código que aparece nela.");
        }, 8000);
    }

    private void onFound(String name, String host, int port) {
        String key = host + ":" + port;
        if (tvs.containsKey(key)) return;
        tvs.put(key, name);
        online.add(key);
        renderTvs();
        if (tv != null) return;
        String last = prefs.getString("last", null);
        String fav = favourite();
        if (key.equals(fav) || (fav == null && (key.equals(last) || tvs.size() == 1))) connect(key, name);
    }

    private void connectByCode() {
        String[] r = Codes.decode(code.getText().toString());
        if (r == null) {
            say("Código inválido. Ele tem 8 letras/números, tipo ABCD-1234.", false);
            return;
        }
        String key = r[0] + ":" + r[1];
        say("Conectando…", true);
        io.execute(() -> {
            try {
                String h = Net.get("http://" + key + "/api/hello", 3000);
                if (!h.contains("\"app\":\"tvdrop\"")) throw new Exception("não é o TV Drop");
                String name = Net.str(h, "name");
                ui.post(() -> connect(key, name == null ? key : name));
            } catch (Exception e) {
                ui.post(() -> say("Não achei a TV por esse código. Celular e TV precisam estar na mesma rede (mesmo Wi-Fi/roteador).", false));
            }
        });
    }

    /**
     * TV Drop 2.0 TVs need this phone to be paired once (PIN shown on the TV);
     * 1.0 TVs have no /api/v2 and work as before.
     */
    private void connect(String key, String name) {
        if (discovery != null) discovery.stop();
        status.setText("Conectando a " + name + "…");
        io.execute(() -> {
            int info = Net.status("http://" + key + "/api/v2/info", 4000);
            if (info == 404) { // TV Drop 1.0 on the TV
                Net.token = null;
                ui.post(() -> connected(key, name));
                return;
            }
            if (info < 0) {
                ui.post(() -> say("Não consegui falar com " + name + ".", false));
                return;
            }
            Net.token = prefs.getString("token:" + key, null);
            int session = Net.token == null ? 401 : Net.status("http://" + key + "/api/v2/session", 4000);
            if (session == 200) ui.post(() -> connected(key, name));
            else ui.post(() -> askPin(key, name, null));
        });
    }

    private void askPin(String key, String name, String error) {
        EditText pin = new EditText(this);
        pin.setInputType(InputType.TYPE_CLASS_NUMBER);
        pin.setHint("000000");
        pin.setTextSize(28);
        pin.setGravity(Gravity.CENTER);
        new android.app.AlertDialog.Builder(this)
                .setTitle("Parear com " + name)
                .setMessage((error != null ? error + "\n\n" : "") + "Digite o código de 6 números que aparece na tela da TV.")
                .setView(pin)
                .setPositiveButton("Conectar", (d, w) -> {
                    String code = pin.getText().toString();
                    io.execute(() -> {
                        try {
                            JSONObject body = new JSONObject().put("pin", code).put("name", "App TV Drop (" + Build.MODEL + ")");
                            Net.token = null;
                            String r = Net.post("http://" + key + "/api/v2/pair", body.toString());
                            String token = Net.str(r, "token");
                            if (token == null) {
                                String m = Net.str(r, "message");
                                ui.post(() -> askPin(key, name, m == null ? "Código recusado." : m));
                                return;
                            }
                            Net.token = token;
                            prefs.edit().putString("token:" + key, token).apply();
                            ui.post(() -> connected(key, name));
                        } catch (Exception e) {
                            ui.post(() -> askPin(key, name, "Erro: " + e.getMessage()));
                        }
                    });
                })
                .setNegativeButton("Cancelar", (d, w) -> status.setText("Não conectado"))
                .show();
    }

    private void openRemote() {
        if (tv == null) return;
        startActivity(new Intent(this, RemoteActivity.class)
                .putExtra(RemoteActivity.EXTRA_TV, tv)
                .putExtra(RemoteActivity.EXTRA_TOKEN, Net.token));
    }

    private void connected(String key, String name) {
        tv = key;
        tvName = name;
        prefs.edit().putString("last", key).apply();
        if (discovery != null) discovery.stop();
        status.setText("Conectado: " + name);
        status.setTextColor(ACCENT);
        controls.setVisibility(View.VISIBLE);
        rememberTv(key, name);
        renderTvs();
        say("", true);
        if (pendingShare != null) {
            java.util.List<Uri> l = pendingShare;
            pendingShare = null;
            offerShare(l);
        }
    }

    // ---------- saved TVs ("Minhas TVs") ----------

    private JSONObject saved() {
        try {
            return new JSONObject(prefs.getString("saved", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private void putSaved(JSONObject o) {
        prefs.edit().putString("saved", o.toString()).apply();
    }

    private void rememberTv(String key, String name) {
        try {
            JSONObject all = saved();
            JSONObject e = all.optJSONObject(key);
            if (e == null) e = new JSONObject();
            e.put("name", name).put("lastSeen", System.currentTimeMillis());
            all.put(key, e);
            putSaved(all);
        } catch (Exception ignored) {
        }
    }

    private String favourite() {
        JSONObject all = saved();
        java.util.Iterator<String> it = all.keys();
        while (it.hasNext()) {
            String k = it.next();
            if (all.optJSONObject(k) != null && all.optJSONObject(k).optBoolean("fav")) return k;
        }
        return null;
    }

    private String label(String key, String fallback) {
        JSONObject e = saved().optJSONObject(key);
        if (e == null) return fallback;
        String nick = e.optString("nick", "");
        return nick.isEmpty() ? e.optString("name", fallback) : nick;
    }

    /** "Online" only after the TV answered: a saved address alone proves nothing. */
    private void probeSaved() {
        JSONObject all = saved();
        java.util.Iterator<String> it = all.keys();
        while (it.hasNext()) {
            final String k = it.next();
            io.execute(() -> {
                boolean up = Net.status("http://" + k + "/api/hello", 1500) == 200;
                ui.post(() -> {
                    if (up) online.add(k); else online.remove(k);
                    renderTvs();
                });
            });
        }
    }

    private void tvMenu(String key, String name) {
        boolean fav = key.equals(favourite());
        String[] items = {"Renomear", fav ? "Deixar de ser a favorita" : "Tornar favorita (conecta sozinha)", "Encontrar (tocar um som)", "Remover"};
        new android.app.AlertDialog.Builder(this).setTitle(label(key, name)).setItems(items, (d, which) -> {
            JSONObject all = saved();
            try {
                JSONObject e = all.optJSONObject(key);
                if (e == null) { e = new JSONObject().put("name", name); all.put(key, e); }
                switch (which) {
                    case 0: {
                        EditText in = new EditText(this);
                        in.setText(label(key, name));
                        final JSONObject entry = e;
                        new android.app.AlertDialog.Builder(this).setTitle("Apelido (ex.: Sala, Quarto)").setView(in)
                                .setPositiveButton("Salvar", (d2, w2) -> {
                                    try { entry.put("nick", in.getText().toString().trim()); all.put(key, entry); putSaved(all); } catch (Exception ignored) {}
                                    renderTvs();
                                }).setNegativeButton("Cancelar", null).show();
                        return;
                    }
                    case 1: {
                        java.util.Iterator<String> it = all.keys();
                        while (it.hasNext()) { JSONObject o = all.optJSONObject(it.next()); if (o != null) o.remove("fav"); }
                        if (!fav) e.put("fav", true);
                        break;
                    }
                    case 2: findTv(key); return;
                    default:
                        all.remove(key);
                        prefs.edit().remove("token:" + key).apply();
                        break;
                }
                putSaved(all);
            } catch (Exception ignored) {
            }
            renderTvs();
        }).show();
    }

    /** Plays a sound on the TV (needs this phone to be paired with it). */
    private void findTv(String key) {
        String token = prefs.getString("token:" + key, null);
        io.execute(() -> {
            String old = Net.token;
            try {
                Net.token = token;
                String r = Net.post("http://" + key + "/api/v2/beep", "");
                boolean ok = Net.bool(r, "ok");
                ui.post(() -> say(ok ? "A TV está tocando um som." : "A TV não respondeu: " + Net.str(r, "message"), ok));
            } catch (Exception e) {
                ui.post(() -> say("A TV não está acessível agora (desligada ou fora da rede).", false));
            } finally {
                if (tv == null || !tv.equals(key)) Net.token = old;
            }
        });
    }

    private void disconnect() {
        tv = null;
        status.setTextColor(Color.WHITE);
        controls.setVisibility(View.GONE);
        startDiscovery();
    }

    private void renderTvs() {
        tvList.removeAllViews();
        Map<String, String> all = new LinkedHashMap<>();
        String fav = favourite();
        JSONObject sv = saved();
        if (fav != null && sv.optJSONObject(fav) != null) all.put(fav, sv.optJSONObject(fav).optString("name", fav));
        java.util.Iterator<String> it = sv.keys();
        while (it.hasNext()) { String k = it.next(); if (!all.containsKey(k)) all.put(k, sv.optJSONObject(k).optString("name", k)); }
        for (Map.Entry<String, String> e : tvs.entrySet()) if (!all.containsKey(e.getKey())) all.put(e.getKey(), e.getValue());
        for (Map.Entry<String, String> e : all.entrySet()) {
            final String key = e.getKey(), name = e.getValue();
            boolean on = key.equals(tv);
            String state = on ? "✓ " : online.contains(key) ? "🟢 " : sv.has(key) ? "⚪ " : "📺 ";
            String extra = key.equals(fav) ? "  ★" : "";
            JSONObject entry = sv.optJSONObject(key);
            String seen = entry != null && !online.contains(key) && !on && entry.optLong("lastSeen") > 0
                    ? "\nVista por último: " + new java.text.SimpleDateFormat("dd/MM HH:mm", java.util.Locale.ROOT).format(new java.util.Date(entry.optLong("lastSeen"))) : "";
            Button b = button(state + label(key, name) + extra + "  (" + key.split(":")[0] + ")" + seen, on);
            b.setOnClickListener(v -> connect(key, name));
            b.setOnLongClickListener(v -> { tvMenu(key, name); return true; });
            tvList.addView(b);
        }
        if (!all.isEmpty()) tvList.addView(text("Toque para conectar · toque e segure para apelido, favorita, encontrar ou remover.", 12, MUTED));
    }

    // ---------- actions ----------

    private void handleShare(Intent i) {
        if (i == null) return;
        Uri u = null;
        if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) {
            @SuppressWarnings("deprecation")
            java.util.ArrayList<Uri> list = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null && !list.isEmpty()) shareFiles(list);
            return;
        }
        if (Intent.ACTION_SEND.equals(i.getAction())) {
            @SuppressWarnings("deprecation")
            Uri s = i.getParcelableExtra(Intent.EXTRA_STREAM);
            u = s;
            if (u == null) {
                String text = i.getStringExtra(Intent.EXTRA_TEXT);
                if (text != null && text.matches("(?is).*https?://\\S+.*")) {
                    String url = text.replaceAll("(?is).*?(https?://\\S+).*", "$1");
                    if (tv != null) playLink(url);
                    else link.setText(url);
                    return;
                }
            }
        } else if (Intent.ACTION_VIEW.equals(i.getAction())) {
            u = i.getData();
        }
        if (u == null) return;
        shareFiles(java.util.Collections.singletonList(u));
    }

    private void shareFiles(java.util.List<Uri> uris) {
        if (tv != null) offerShare(uris);
        else {
            pendingShare = new java.util.ArrayList<>(uris);
            say("Assim que conectar a uma TV, você escolhe o que fazer com " + (uris.size() == 1 ? "o arquivo" : uris.size() + " arquivos") + ".", true);
        }
    }

    /** Videos/music: play now or queue (served from the phone, no copy) or copy. Other files: copy to the TV. */
    private void offerShare(java.util.List<Uri> uris) {
        boolean media = true;
        for (Uri u : uris) {
            String t = getContentResolver().getType(u);
            if (t == null || !(t.startsWith("video/") || t.startsWith("audio/"))) media = false;
        }
        final String target = tv;
        String title = uris.size() == 1 ? displayName(uris.get(0)) : uris.size() + " arquivos";
        String[] items = media
                ? new String[]{"Tocar agora na TV (sem copiar)", "Adicionar à fila da TV (sem copiar)", "Copiar para a TV (arquivos recebidos)"}
                : new String[]{"Enviar para a TV (arquivos recebidos)", "Enviar e abrir na TV (APK: instalar)"};
        final boolean isMedia = media;
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
                final int done = k + 1;
                ui.post(() -> say("Enviando… " + done + "/" + uris.size(), true));
            }
            final int n = ok;
            final String last = err;
            ui.post(() -> say(n + " de " + uris.size() + " concluído(s)." + (last != null ? " Último erro: " + last : ""), last == null));
        })).setNegativeButton("Cancelar", null).show();
    }

    private void pick(int req, String type) {
        if (tv == null) {
            say("Conecte a uma TV primeiro.", false);
            return;
        }
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(type);
        if (req == PICK_VIDEO) i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"});
        startActivityForResult(i, req);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        Uri u = data.getData();
        try {
            getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
        }
        if (req == PICK_VIDEO) castVideo(u);
        else sendApk(u);
    }

    /** The phone serves the file; the TV plays it straight from the phone. */
    private void castVideo(Uri u) {
        final String target = tv;
        final String name = displayName(u);
        say("Preparando " + name + "…", true);
        io.execute(() -> {
            String err = PhoneCast.cast(this, target, u);
            ui.post(() -> say(err == null ? "Transmitindo " + name + " para a TV. Mantenha o celular no Wi-Fi." : err, err == null));
        });
    }

    private void sendApk(Uri u) {
        final String target = tv;
        final String name = displayName(u);
        final long size = size(u);
        say("Enviando " + name + "…", true);
        io.execute(() -> {
            try (InputStream in = getContentResolver().openInputStream(u)) {
                if (size <= 0) throw new Exception("tamanho do arquivo desconhecido");
                String url = "http://" + target + "/api/upload?auto=1&name=" + URLEncoder.encode(name, "UTF-8");
                long[] last = {0};
                String r = Net.upload(url, in, size, (sent, total) -> {
                    long now = System.currentTimeMillis();
                    if (now - last[0] < 300) return;
                    last[0] = now;
                    ui.post(() -> say(String.format(Locale.ROOT, "Enviando %s… %d%%", name, sent * 100 / total), true));
                });
                boolean ok = Net.bool(r, "ok");
                ui.post(() -> say(String.valueOf(Net.str(r, "message")), ok));
            } catch (Exception e) {
                ui.post(() -> say("Falha ao enviar: " + e.getMessage(), false));
            }
        });
    }

    private void playLink(String url) {
        if (tv == null) {
            say("Conecte a uma TV primeiro.", false);
            return;
        }
        final String target = tv;
        io.execute(() -> {
            try {
                String r = Net.post("http://" + target + "/api/play", url.trim());
                ui.post(() -> say(String.valueOf(Net.str(r, "message")), Net.bool(r, "ok")));
            } catch (Exception e) {
                ui.post(() -> say("TV não respondeu: " + e.getMessage(), false));
            }
        });
    }

    private void control(String cmd) {
        if (tv == null) return;
        final String target = tv;
        io.execute(() -> {
            try {
                String r = Net.post("http://" + target + "/api/control?cmd=" + cmd, "");
                if (!Net.bool(r, "ok")) ui.post(() -> say(String.valueOf(Net.str(r, "message")), false));
            } catch (Exception e) {
                ui.post(() -> say("TV não respondeu.", false));
            }
        });
        if ("stop".equals(cmd)) StreamService.stop(this);
    }

    // ---------- status polling ----------

    private void pollStatus() {
        ui.postDelayed(pollTick, 1000);
        if (tv == null || pollQueued) return;
        pollQueued = true;
        final String target = tv;
        poll.execute(() -> {
            try {
                String s = Net.get("http://" + target + "/api/status", 2500);
                ui.post(() -> showStatus(s));
            } catch (Exception e) {
                ui.post(() -> status.setText("Sem resposta de " + tvName + "…"));
            } finally {
                ui.post(() -> pollQueued = false);
            }
        });
    }

    private void showStatus(String s) {
        if (tv == null) return;
        status.setText("Conectado: " + tvName);
        String p = Net.str(s, "playing");
        long pos = Net.num(s, "position", 0), dur = Net.num(s, "duration", 0);
        if (p == null) {
            nowPlaying.setText("Nada tocando na TV");
            audioView.setText("");
            time.setText("");
            seek.setEnabled(false);
            seek.setProgress(0);
            return;
        }
        String n = p.substring(p.lastIndexOf('/') + 1);
        try {
            n = java.net.URLDecoder.decode(n, "UTF-8");
        } catch (Exception ignored) {
        }
        nowPlaying.setText((Net.bool(s, "paused") ? "⏸ " : "▶ ") + n);
        String a = Net.str(s, "audio");
        audioView.setText(a == null || a.isEmpty() ? "" : "Áudio: " + a);
        String ext = Net.str(s, "externalPlayer");
        external.setText(ext == null || ext.isEmpty() ? "Sem som? Instale o VLC na TV" : "Sem som? Abrir no " + ext + " da TV");
        seek.setEnabled(dur > 0);
        if (!userSeeking && dur > 0) {
            seek.setMax((int) (dur / 1000));
            seek.setProgress((int) (pos / 1000));
        }
        time.setText(fmt(pos) + " / " + (dur > 0 ? fmt(dur) : "--:--"));
    }

    private static String fmt(long ms) {
        long s = ms / 1000;
        return s >= 3600 ? String.format(Locale.ROOT, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
                : String.format(Locale.ROOT, "%d:%02d", s / 60, s % 60);
    }

    // ---------- file info ----------

    private String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
        } catch (Exception ignored) {
        }
        String last = u.getLastPathSegment();
        return last == null ? "video" : last;
    }

    private long size(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) {
        }
        return -1;
    }

    // ---------- UI ----------

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(20), dp(16), dp(32));

        TextView title = text("TV Drop", 28, Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);
        status = text("Procurando a TV na rede…", 15, Color.WHITE);
        status.setPadding(0, dp(4), 0, dp(12));
        root.addView(status);

        // TV picker
        LinearLayout c1 = card(root, "TVs na rede");
        tvList = new LinearLayout(this);
        tvList.setOrientation(LinearLayout.VERTICAL);
        c1.addView(tvList);
        c1.addView(text("Não apareceu? Digite o código que aparece na tela da TV:", 14, MUTED));
        LinearLayout row = hrow();
        code = new EditText(this);
        code.setHint("ABCD-1234");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        code.setImeOptions(EditorInfo.IME_ACTION_GO);
        code.setOnEditorActionListener((v, a, e) -> { connectByCode(); return true; });
        styleInput(code);
        row.addView(code, new LinearLayout.LayoutParams(0, -2, 1f));
        Button go = button("Conectar", true);
        go.setOnClickListener(v -> connectByCode());
        row.addView(go, new LinearLayout.LayoutParams(-2, -2));
        c1.addView(row);
        Button again = button("Procurar de novo", false);
        again.setOnClickListener(v -> disconnect());
        c1.addView(again);

        // controls (only when connected)
        controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setVisibility(View.GONE);
        root.addView(controls);

        LinearLayout c2 = card(controls, "Transmitir");
        Button remote = button("🎮  Controle remoto, apps e mais", true);
        remote.setOnClickListener(v -> openRemote());
        c2.addView(remote);
        Button cast = button("▶  Transmitir vídeo do celular", true);
        cast.setOnClickListener(v -> pick(PICK_VIDEO, "*/*"));
        c2.addView(cast);
        c2.addView(text("O vídeo não é copiado: a TV toca direto do celular, em qualidade original.", 13, MUTED));
        link = new EditText(this);
        link.setHint("ou cole um link (.mp4, .m3u8)");
        link.setInputType(InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_CLASS_TEXT);
        styleInput(link);
        c2.addView(link);
        Button pl = button("Tocar link na TV", false);
        pl.setOnClickListener(v -> playLink(link.getText().toString()));
        c2.addView(pl);
        Button apk = button("📦  Enviar APK para a TV", false);
        apk.setOnClickListener(v -> pick(PICK_APK, "application/vnd.android.package-archive"));
        c2.addView(apk);

        LinearLayout c3 = card(controls, "Controle");
        nowPlaying = text("Nada tocando na TV", 15, ACCENT);
        c3.addView(nowPlaying);
        audioView = text("", 13, MUTED);
        c3.addView(audioView);
        seek = new SeekBar(this);
        seek.setEnabled(false);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) {}
            @Override public void onStartTrackingTouch(SeekBar s) { userSeeking = true; }
            @Override public void onStopTrackingTouch(SeekBar s) {
                userSeeking = false;
                control("seek&ms=" + (s.getProgress() * 1000L));
            }
        });
        c3.addView(seek);
        time = text("", 13, MUTED);
        time.setGravity(Gravity.END);
        c3.addView(time);
        c3.addView(controlRow(new String[]{"⏪ 10s", "⏯", "30s ⏩", "⏹"}, new String[]{"back", "toggle", "fwd", "stop"}));
        c3.addView(controlRow(new String[]{"🔉", "🔇", "🔊"}, new String[]{"voldown", "mute", "volup"}));
        external = button("Sem som? Abrir no VLC da TV", false);
        external.setOnClickListener(v -> control("external"));
        c3.addView(external);

        msg = text("", 14, MUTED);
        msg.setPadding(0, dp(8), 0, 0);
        root.addView(msg);

        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        sv.setFillViewport(true);
        sv.addView(root);
        setContentView(sv);
    }

    private LinearLayout controlRow(String[] labels, String[] cmds) {
        LinearLayout r = hrow();
        for (int i = 0; i < labels.length; i++) {
            final String cmd = cmds[i];
            Button b = button(labels[i], "toggle".equals(cmd));
            b.setGravity(Gravity.CENTER);
            b.setOnClickListener(v -> control(cmd));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1f);
            lp.setMargins(dp(3), dp(4), dp(3), dp(4));
            r.addView(b, lp);
        }
        return r;
    }

    private void say(String s, boolean ok) {
        msg.setText(s);
        msg.setTextColor(ok ? 0xFF81C784 : 0xFFEF9A9A);
    }

    private LinearLayout card(LinearLayout parent, String title) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(14), dp(14), dp(14), dp(14));
        c.setBackground(round(CARD, 14));
        TextView t = text(title, 17, Color.WHITE);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, 0, 0, dp(8));
        c.addView(t);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, dp(12));
        parent.addView(c, lp);
        return c;
    }

    private LinearLayout hrow() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        return r;
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        return t;
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setTextColor(primary ? 0xFF05212E : Color.WHITE);
        b.setBackground(round(primary ? ACCENT : 0xFF2A353E, 10));
        b.setPadding(dp(14), dp(10), dp(14), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(4), 0, dp(4));
        b.setLayoutParams(lp);
        return b;
    }

    private void styleInput(EditText e) {
        e.setTextColor(Color.WHITE);
        e.setHintTextColor(0xFF66747F);
        e.setSingleLine(true);
        e.setBackground(round(0xFF0C1013, 10));
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
    }

    private static GradientDrawable round(int color, int r) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(r * 3);
        return d;
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }
}
