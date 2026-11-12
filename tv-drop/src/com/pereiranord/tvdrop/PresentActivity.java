package com.pereiranord.tvdrop;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;

/** TV: PDF presentation (slides, documents). Pages change from the phone or with the remote's arrows. */
public class PresentActivity extends Activity {
    static final String EXTRA_PATH = "path";
    private static volatile PresentActivity current;
    private static final Object pdfLock = new Object();
    private PdfRenderer renderer;
    private ParcelFileDescriptor fd;
    private String name = "";
    private volatile int page, pages;
    private ImageView view;
    private TextView counter;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new ImageView(this);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));
        counter = new TextView(this);
        counter.setTextColor(0xCCFFFFFF);
        counter.setTextSize(16);
        counter.setPadding(24, 12, 24, 12);
        counter.setShadowLayer(6, 0, 0, Color.BLACK);
        root.addView(counter, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END));
        setContentView(root);
        open(getIntent().getStringExtra(EXTRA_PATH));
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        open(intent.getStringExtra(EXTRA_PATH));
    }

    private void open(String path) {
        close();
        try {
            File f = new File(path);
            fd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
            synchronized (pdfLock) {
                renderer = new PdfRenderer(fd);
                pages = renderer.getPageCount();
            }
            name = f.getName();
            Events.add("Apresentando: " + name + " (" + pages + " páginas)");
            go(0);
        } catch (Exception e) {
            Events.add("Não consegui abrir o PDF: " + e.getMessage());
            finish();
        }
    }

    private void go(int p) {
        if (pages == 0) return;
        page = Math.max(0, Math.min(pages - 1, p));
        Bitmap bmp = render(page, getResources().getDisplayMetrics().widthPixels);
        if (bmp != null) view.setImageBitmap(bmp);
        counter.setText((page + 1) + " / " + pages);
    }

    private Bitmap render(int p, int width) {
        synchronized (pdfLock) {
            if (renderer == null || p < 0 || p >= pages) return null;
            try (PdfRenderer.Page pg = renderer.openPage(p)) {
                int w = Math.max(320, width);
                int h = Math.round(w * (pg.getHeight() / (float) pg.getWidth()));
                Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                bmp.eraseColor(Color.WHITE);
                pg.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                return bmp;
            } catch (Exception e) {
                return null;
            }
        }
    }

    // ---- called from the web server ----

    static JSONObject state() {
        PresentActivity a = current;
        if (a == null) return null;
        try {
            return new JSONObject().put("file", a.name).put("page", a.page).put("pages", a.pages);
        } catch (Exception e) {
            return null;
        }
    }

    static JSONObject control(String action, int page) {
        PresentActivity a = current;
        if (a == null) return null;
        java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
        a.runOnUiThread(() -> {
            switch (action) {
                case "next": a.go(a.page + 1); break;
                case "prev": a.go(a.page - 1); break;
                case "goto": a.go(page); break;
                case "stop": a.finish(); break;
                default: break;
            }
            done.countDown();
        });
        try {
            done.await(3, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
        return "stop".equals(action) ? null : state();
    }

    static byte[] pageJpeg(int page) {
        PresentActivity a = current;
        if (a == null) return null;
        Bitmap bmp = a.render(page, 640);
        if (bmp == null) return null;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 80, out);
        return out.toByteArray();
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_DPAD_RIGHT || code == KeyEvent.KEYCODE_DPAD_DOWN || code == KeyEvent.KEYCODE_PAGE_DOWN) { go(page + 1); return true; }
        if (code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_PAGE_UP) { go(page - 1); return true; }
        return super.onKeyDown(code, e);
    }

    private void close() {
        synchronized (pdfLock) {
            if (renderer != null) renderer.close();
            renderer = null;
            pages = 0;
        }
        if (fd != null) {
            try { fd.close(); } catch (Exception ignored) {}
            fd = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = this;
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        close();
        super.onDestroy();
    }
}
