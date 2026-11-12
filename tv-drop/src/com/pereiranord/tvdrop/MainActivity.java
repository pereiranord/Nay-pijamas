package com.pereiranord.tvdrop;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import java.io.File;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * TV screen: QR code + PIN to pair a phone, paired devices, what the remote can
 * do, permissions, received files and a log.
 */
public class MainActivity extends Activity {
    static final int BG = 0xFF15171A, CARD = 0xFF1E2125, CARD_FOCUS = 0xFF2E7D4F, GREEN = 0xFF3DDC84,
            TEXT = 0xFFECEFF1, MUTED = 0xFF9AA4AD, WARN = 0xFFFFCC80;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView pinView, pinTimer, address, codeView, status, perms, log;
    private ImageView qr;
    private LinearLayout filesBox, permButtons, devicesBox;
    private Button legacyButton;
    private String lastFiles = "", lastDevices = "", lastQr = "";
    private Pairing pairing;

    private final Runnable tick = this::tick;

    private void tick() {
        refresh();
        ui.postDelayed(tick, 1000);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        ServerService.start(this);
        pairing = ServerService.pairing(this);

        // left: connect a phone
        LinearLayout left = column();
        left.setPadding(56, 40, 28, 40);
        TextView title = text("TV Drop", 38, TEXT);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        left.addView(title);
        left.addView(text("Central multimídia e controle remoto", 16, MUTED));

        LinearLayout connect = card();
        connect.addView(text("Conectar um celular", 20, TEXT));
        connect.addView(text("Aponte a câmera do celular para o QR Code, ou abra o app TV Drop e digite o código:", 15, MUTED));
        LinearLayout qrRow = new LinearLayout(this);
        qrRow.setOrientation(LinearLayout.HORIZONTAL);
        qrRow.setGravity(Gravity.CENTER_VERTICAL);
        qrRow.setPadding(0, 16, 0, 8);
        qr = new ImageView(this);
        qrRow.addView(qr, new LinearLayout.LayoutParams(220, 220));
        LinearLayout pinBox = column();
        pinBox.setPadding(32, 0, 0, 0);
        pinView = text("------", 52, GREEN);
        pinView.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        pinView.setLetterSpacing(0.08f);
        pinBox.addView(pinView);
        pinTimer = text("", 14, MUTED);
        pinBox.addView(pinTimer);
        qrRow.addView(pinBox);
        connect.addView(qrRow);
        address = text("", 15, MUTED);
        connect.addView(address);
        codeView = text("", 15, MUTED);
        connect.addView(codeView);
        left.addView(connect);

        LinearLayout statusCard = card();
        statusCard.addView(text("Controle remoto", 20, TEXT));
        status = text("", 15, MUTED);
        statusCard.addView(status);
        perms = text("", 15, WARN);
        perms.setPadding(0, 12, 0, 0);
        statusCard.addView(perms);
        permButtons = column();
        statusCard.addView(permButtons);
        left.addView(statusCard);

        // right: devices, files, log
        LinearLayout right = column();
        right.setPadding(28, 40, 56, 40);

        LinearLayout devicesCard = card();
        devicesCard.addView(text("Aparelhos pareados", 20, TEXT));
        devicesBox = column();
        devicesCard.addView(devicesBox);
        legacyButton = button("", v -> {
            pairing.setLegacyOpen(!pairing.legacyOpen());
            lastDevices = "";
        });
        devicesCard.addView(legacyButton);
        right.addView(devicesCard);

        LinearLayout filesCard = card();
        filesCard.addView(text("Arquivos recebidos", 20, TEXT));
        filesBox = column();
        filesCard.addView(filesBox);
        right.addView(filesCard);

        LinearLayout logCard = card();
        logCard.addView(text("Atividade", 20, TEXT));
        log = text("", 13, MUTED);
        log.setTypeface(Typeface.MONOSPACE);
        logCard.addView(log);
        right.addView(logCard);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setBackgroundColor(BG);
        row.addView(scroll(left), new LinearLayout.LayoutParams(0, -1, 1.05f));
        row.addView(scroll(right), new LinearLayout.LayoutParams(0, -1, 0.95f));
        setContentView(row);
    }

    @Override
    protected void onResume() {
        super.onResume();
        lastFiles = "";
        lastDevices = "";
        ui.post(tick);
    }

    @Override
    protected void onPause() {
        ui.removeCallbacks(tick);
        super.onPause();
    }

    private void refresh() {
        int port = ServerService.port();
        String ip = Actions.ip();
        String pin = pairing.pin();
        long left = Math.max(0, (pairing.pinExpiresAt() - System.currentTimeMillis()) / 1000);
        pinView.setText(pin.substring(0, 3) + " " + pin.substring(3));
        pinTimer.setText("Código novo em " + left + " s");
        if (port != 0) {
            String url = "http://" + ip + ":" + port + "/?pair=" + pin;
            if (!url.equals(lastQr)) {
                qr.setImageBitmap(qrBitmap(url, 220));
                lastQr = url;
            }
            address.setText("Navegador: http://" + ip + ":" + port);
            String code = Codes.encode(ip, port);
            codeView.setText(code == null ? "" : "Endereço da TV (conexão manual): " + code);
        } else {
            address.setText("Iniciando o servidor…");
        }

        // remote status
        TvDropAccessibility acc = TvDropAccessibility.get();
        HttpServer srv = ServerService.server();
        StringBuilder st = new StringBuilder();
        st.append("Android ").append(Build.VERSION.RELEASE).append(" (SDK ").append(Build.VERSION.SDK_INT).append(")\n");
        st.append(acc != null ? "✓ Acessibilidade ativa: touchpad, Voltar, Início"
                + (Build.VERSION.SDK_INT >= 33 ? ", setas" : "") : "• Acessibilidade desligada (touchpad indisponível)");
        st.append("\n• Teclas completas, Liga/Desliga e teclado: pareie o controle pelo celular (Dispositivos → Parear controle).");
        status.setText(st.toString());

        boolean inst = Actions.canInstall(this), over = Actions.canOverlay(this);
        StringBuilder p = new StringBuilder();
        if (!inst) p.append("• Para instalar APKs, permita \"Instalar apps desconhecidos\" para o TV Drop.\n");
        if (!over) p.append("• Para vídeos e apps abrirem com o TV Drop fechado, permita \"Sobrepor a outros apps\".\n");
        perms.setText(p.toString().trim());
        perms.setVisibility(p.length() == 0 ? View.GONE : View.VISIBLE);
        if (permButtons.getChildCount() != (inst ? 0 : 1) + (over ? 0 : 1)) {
            permButtons.removeAllViews();
            if (!inst) permButtons.addView(button("Permitir instalar APKs", v -> openSettings(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)));
            if (!over) permButtons.addView(button("Permitir sobrepor", v -> openSettings(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)));
        }

        refreshDevices();

        List<String> lines = Events.snapshot();
        StringBuilder l = new StringBuilder();
        for (int i = 0; i < Math.min(8, lines.size()); i++) l.append(lines.get(i)).append('\n');
        log.setText(l.length() == 0 ? "Nada ainda." : l.toString().trim());

        refreshFiles();
    }

    private void refreshDevices() {
        List<Pairing.Device> list = pairing.devices();
        StringBuilder key = new StringBuilder(String.valueOf(pairing.legacyOpen()));
        for (Pairing.Device d : list) key.append(d.id).append(d.name).append('|');
        if (key.toString().equals(lastDevices)) return;
        lastDevices = key.toString();
        devicesBox.removeAllViews();
        if (list.isEmpty()) devicesBox.addView(text("Nenhum aparelho ainda.", 15, MUTED));
        for (Pairing.Device d : list) {
            final String id = d.id;
            devicesBox.addView(button("✕  Remover \"" + d.name + "\"", v -> {
                pairing.revoke(id);
                lastDevices = "";
                Events.add("Aparelho removido na TV");
            }));
        }
        legacyButton.setText(pairing.legacyOpen()
                ? "Apps antigos (1.0) sem pareamento: PERMITIDO — toque para bloquear"
                : "Apps antigos (1.0) sem pareamento: bloqueado — toque para permitir");
    }

    private void refreshFiles() {
        File[] files = Actions.inbox(this).listFiles();
        if (files == null) files = new File[0];
        Arrays.sort(files, (a, c) -> Long.compare(c.lastModified(), a.lastModified()));
        StringBuilder key = new StringBuilder();
        for (File f : files) key.append(f.getName()).append(f.length()).append('|');
        if (key.toString().equals(lastFiles)) return;
        lastFiles = key.toString();
        filesBox.removeAllViews();
        if (files.length == 0) {
            filesBox.addView(text("Nenhum arquivo ainda.", 15, MUTED));
            return;
        }
        for (File f : files) {
            final File file = f;
            String mb = String.format(Locale.ROOT, "%.1f MB", f.length() / 1048576.0);
            String verb = Actions.isApk(f.getName()) ? "Instalar" : Actions.isVideo(f.getName()) ? "Tocar" : null;
            if (verb == null) {
                filesBox.addView(text(f.getName() + "  (" + mb + ")", 15, TEXT));
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

    static Bitmap qrBitmap(String content, int size) {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 1);
            BitMatrix m = new QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints);
            Bitmap bmp = Bitmap.createBitmap(m.getWidth(), m.getHeight(), Bitmap.Config.ARGB_8888);
            for (int y = 0; y < m.getHeight(); y++) {
                for (int x = 0; x < m.getWidth(); x++) bmp.setPixel(x, y, m.get(x, y) ? Color.BLACK : Color.WHITE);
            }
            return bmp;
        } catch (Exception e) {
            return null;
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

    private LinearLayout card() {
        LinearLayout c = column();
        c.setPadding(28, 24, 28, 24);
        c.setBackground(round(CARD, 22));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 20, 0, 0);
        c.setLayoutParams(lp);
        return c;
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
        b.setTextSize(15);
        b.setTextColor(TEXT);
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setPadding(24, 14, 24, 14);
        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_focused}, round(CARD_FOCUS, 14));
        bg.addState(new int[]{}, round(0xFF2A2E33, 14));
        b.setBackground(bg);
        b.setFocusable(true);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 8, 0, 0);
        b.setLayoutParams(lp);
        return b;
    }

    static GradientDrawable round(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }
}
