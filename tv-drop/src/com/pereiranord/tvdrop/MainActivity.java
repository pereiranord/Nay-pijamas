package com.pereiranord.tvdrop;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.util.Arrays;
import java.util.List;

/** TV screen: address to open on the phone, permissions, received files and a log. */
public class MainActivity extends Activity {
    private static final int BG = 0xFF101418;
    private static final int ACCENT = 0xFF4FC3F7;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView address, codeView, perms, log;
    private LinearLayout filesBox, permButtons;
    private String lastFiles = "";

    private final Runnable tick = this::tick;

    private void tick() {
        refresh();
        ui.postDelayed(tick, 2000);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        ServerService.start(this);

        LinearLayout left = column();
        left.setPadding(64, 48, 32, 48);
        TextView title = text("TV Drop", 40, Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        left.addView(title);
        left.addView(text("No celular, abra o app TV Drop: ele acha a TV sozinho. Se não achar, digite o código:", 18, 0xFFB0BEC5));
        codeView = text("...", 44, ACCENT);
        codeView.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        codeView.setPadding(0, 8, 0, 16);
        left.addView(codeView);
        left.addView(text("Sem o app, pelo navegador do celular ou computador:", 16, 0xFFB0BEC5));
        address = text("...", 24, Color.WHITE);
        address.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        address.setPadding(0, 4, 0, 8);
        left.addView(address);
        perms = text("", 16, 0xFFFFCC80);
        perms.setPadding(0, 24, 0, 8);
        left.addView(perms);
        permButtons = column();
        left.addView(permButtons);
        TextView logTitle = text("Atividade", 20, Color.WHITE);
        logTitle.setPadding(0, 24, 0, 4);
        left.addView(logTitle);
        log = text("", 14, 0xFF90A4AE);
        log.setTypeface(Typeface.MONOSPACE);
        left.addView(log);

        LinearLayout right = column();
        right.setPadding(32, 48, 64, 48);
        TextView ft = text("Arquivos recebidos", 24, Color.WHITE);
        ft.setTypeface(Typeface.DEFAULT_BOLD);
        right.addView(ft);
        filesBox = column();
        right.addView(filesBox);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setBackgroundColor(BG);
        row.addView(scroll(left), new LinearLayout.LayoutParams(0, -1, 1.1f));
        row.addView(scroll(right), new LinearLayout.LayoutParams(0, -1, 0.9f));
        setContentView(row);
    }

    @Override
    protected void onResume() {
        super.onResume();
        lastFiles = "";
        ui.post(tick);
    }

    @Override
    protected void onPause() {
        ui.removeCallbacks(tick);
        super.onPause();
    }

    private void refresh() {
        int port = ServerService.port();
        address.setText(port == 0 ? "iniciando..." : "http://" + Actions.ip() + ":" + port);
        String code = port == 0 ? null : Codes.encode(Actions.ip(), port);
        codeView.setText(code == null ? "sem rede" : code);

        boolean inst = Actions.canInstall(this), over = Actions.canOverlay(this);
        StringBuilder p = new StringBuilder();
        if (!inst) p.append("• Para instalar APKs, permita \"Instalar apps desconhecidos\" para o TV Drop.\n");
        if (!over) p.append("• Para os vídeos e instalações abrirem sozinhos com o TV Drop fechado, permita \"Sobrepor a outros apps\".\n");
        perms.setText(p.toString().trim());
        perms.setVisibility(p.length() == 0 ? View.GONE : View.VISIBLE);
        if (permButtons.getChildCount() != (inst ? 0 : 1) + (over ? 0 : 1)) {
            permButtons.removeAllViews();
            if (!inst) permButtons.addView(button("Permitir instalar APKs", v -> openSettings(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)));
            if (!over) permButtons.addView(button("Permitir sobrepor", v -> openSettings(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION)));
        }

        List<String> lines = Events.snapshot();
        StringBuilder l = new StringBuilder();
        for (int i = 0; i < Math.min(10, lines.size()); i++) l.append(lines.get(i)).append('\n');
        log.setText(l.length() == 0 ? "Nada ainda." : l.toString().trim());

        File[] files = Actions.inbox(this).listFiles();
        if (files == null) files = new File[0];
        Arrays.sort(files, (a, c) -> Long.compare(c.lastModified(), a.lastModified()));
        StringBuilder key = new StringBuilder();
        for (File f : files) key.append(f.getName()).append(f.length()).append('|');
        if (key.toString().equals(lastFiles)) return;
        lastFiles = key.toString();
        filesBox.removeAllViews();
        if (files.length == 0) {
            filesBox.addView(text("Nenhum arquivo ainda.", 16, 0xFF90A4AE));
            return;
        }
        for (File f : files) {
            final File file = f;
            String mb = String.format(java.util.Locale.ROOT, "%.1f MB", f.length() / 1048576.0);
            String verb = Actions.isApk(f.getName()) ? "Instalar" : Actions.isVideo(f.getName()) ? "Tocar" : null;
            if (verb == null) {
                filesBox.addView(text(f.getName() + "  (" + mb + ")", 16, 0xFFCFD8DC));
                continue;
            }
            filesBox.addView(button(verb + ": " + f.getName() + "  (" + mb + ")", v -> {
                try {
                    if (Actions.isApk(file.getName())) Actions.install(this, file);
                    else Actions.play(this, file.getAbsolutePath());
                } catch (Exception e) {
                    Events.add("Erro: " + e.getMessage());
                }
            }));
        }
    }

    private void openSettings(String action) {
        try {
            startActivity(new Intent(action, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            Events.add("Esta TV não tem essa tela de ajustes. Use o comando adb do LEIA-ME.");
        }
    }

    // ---- tiny view helpers ----

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private ScrollView scroll(View v) {
        ScrollView s = new ScrollView(this);
        s.addView(v);
        return s;
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        return t;
    }

    private Button button(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setTextColor(Color.WHITE);
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setPadding(28, 16, 28, 16);
        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_focused}, round(0xFF0288D1));
        bg.addState(new int[]{}, round(0xFF263238));
        b.setBackground(bg);
        b.setFocusable(true);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 8, 0, 8);
        b.setLayoutParams(lp);
        return b;
    }

    private static GradientDrawable round(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(14);
        return d;
    }
}
