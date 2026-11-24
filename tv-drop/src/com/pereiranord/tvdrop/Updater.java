package com.pereiranord.tvdrop;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.LongSupplier;

/**
 * TV Drop updating itself from its GitHub releases (no adb).
 *
 * Every release publishes update.json: version, and for each APK ("tv", "celular") its address, size and SHA-256.
 * The app reads the newest one, compares the version with its own, downloads the APK for this device, checks the
 * SHA-256 and hands it to Android's installer. Android always asks for a confirmation on the device (a press of OK
 * on the TV remote) and refuses an APK that isn't signed with the app's identity. Nothing runs without that.
 *
 * Plain Java (tested on the JVM); AppUpdates connects it to Android.
 */
public class Updater {
    /** The newest release of the public repository that publishes TV Drop. */
    public static final String FEED = "https://github.com/pereiranord/Nay-pijamas/releases/latest/download/update.json";
    static final String DOWNLOAD_NAME = "TV-Drop-update.apk";

    public interface Installer {
        void install(File apk) throws IOException;
    }

    public static final class Release {
        public int versionCode;
        public String versionName, notes, url, sha256;
        public long size;
    }

    private final String feed;
    private final File dir;
    private final int currentCode;
    private final String currentName, kind;
    private final Installer installer;
    private final LongSupplier clock;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "tvdrop-update");
        t.setDaemon(true);
        return t;
    });

    // what the screens show
    private String state = "idle"; // idle, checking, latest, available, downloading, installing, error
    private int progress;
    private String message;
    private Release latest;
    private long checkedAt;

    /** kind: "tv" or "celular" (which APK of the release this device needs). */
    public Updater(String feed, File dir, int currentCode, String currentName, String kind, Installer installer, LongSupplier clock) {
        this.feed = feed;
        this.dir = dir;
        this.currentCode = currentCode;
        this.currentName = currentName;
        this.kind = kind;
        this.installer = installer;
        this.clock = clock;
    }

    public synchronized JSONObject status() {
        JSONObject o = new JSONObject();
        try {
            o.put("current", currentName).put("currentCode", currentCode).put("kind", kind).put("state", state)
                    .put("progress", progress).put("checkedAt", checkedAt);
            if (message != null) o.put("message", message);
            if (latest != null) o.put("latest", latest.versionName).put("latestCode", latest.versionCode)
                    .put("notes", latest.notes == null ? "" : latest.notes).put("size", latest.size)
                    .put("available", latest.versionCode > currentCode);
        } catch (JSONException ignored) {
        }
        return o;
    }

    public synchronized long checkedAt() {
        return checkedAt;
    }

    public synchronized boolean available() {
        return latest != null && latest.versionCode > currentCode;
    }

    /** Reads the newest release. Returns it when it is newer than this app, or null. */
    public Release check() throws IOException {
        synchronized (this) {
            if ("downloading".equals(state) || "installing".equals(state)) return available() ? latest : null;
            state = "checking";
            message = null;
        }
        try {
            Release r = parse(new String(fetch(feed, 256 * 1024), "UTF-8"), kind);
            synchronized (this) {
                latest = r;
                checkedAt = clock.getAsLong();
                state = r.versionCode > currentCode ? "available" : "latest";
                return r.versionCode > currentCode ? r : null;
            }
        } catch (IOException e) {
            fail("Não consegui ver se há versão nova: " + e.getMessage());
            throw e;
        }
    }

    /** Downloads the newer APK, checks it and opens Android's installer. */
    public void install() throws IOException {
        Release r;
        synchronized (this) {
            if (!available()) throw new IOException("Não há versão nova para instalar.");
            if ("downloading".equals(state) || "installing".equals(state)) return;
            r = latest;
            state = "downloading";
            progress = 0;
            message = null;
        }
        try {
            File apk = download(r);
            synchronized (this) {
                state = "installing";
                message = "Confirme a instalação na tela" + ("tv".equals(kind) ? " da TV (OK no controle)." : ".");
            }
            installer.install(apk);
        } catch (IOException e) {
            fail(e.getMessage());
            throw e;
        }
    }

    public void checkAsync() {
        worker.execute(() -> {
            try {
                check();
            } catch (IOException ignored) { // in status()
            }
        });
    }

    public void installAsync() {
        worker.execute(() -> {
            try {
                if (latest == null) check();
                install();
            } catch (IOException ignored) { // in status()
            }
        });
    }

    /** What Android's installer answered (from InstallReceiver). */
    public synchronized void installResult(boolean ok, String msg) {
        if (ok) { state = "latest"; message = "Atualizado."; }
        else { state = available() ? "available" : "error"; message = msg == null ? "A instalação não foi concluída." : msg; }
    }

    private synchronized void fail(String msg) {
        state = "error";
        message = msg;
    }

    // ---- feed ----

    static Release parse(String json, String kind) throws IOException {
        try {
            JSONObject o = new JSONObject(json);
            JSONObject a = o.getJSONObject("apks").getJSONObject(kind);
            Release r = new Release();
            r.versionCode = o.getInt("versionCode");
            r.versionName = o.getString("versionName");
            r.notes = o.optString("notes", "");
            r.url = a.getString("url");
            r.sha256 = a.getString("sha256").toLowerCase(Locale.ROOT);
            r.size = a.getLong("size");
            // only APKs published on GitHub, over https
            if (!r.url.startsWith("https://github.com/") && !r.url.startsWith("https://objects.githubusercontent.com/")
                    && !r.url.startsWith("http://127.0.0.1")) {
                throw new IOException("endereço do APK fora do GitHub");
            }
            if (!r.sha256.matches("[0-9a-f]{64}") || r.size <= 0 || r.size > 200L * 1024 * 1024) throw new IOException("update.json inválido");
            return r;
        } catch (JSONException e) {
            throw new IOException("update.json inválido: " + e.getMessage());
        }
    }

    // ---- download ----

    private File download(Release r) throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("sem espaço para baixar a atualização");
        File part = new File(dir, DOWNLOAD_NAME + ".part"), done = new File(dir, DOWNLOAD_NAME);
        part.delete();
        done.delete();
        HttpURLConnection c = open(r.url);
        MessageDigest sha;
        try {
            sha = MessageDigest.getInstance("SHA-256");
        } catch (Exception e) {
            throw new IOException(e);
        }
        long got = 0;
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
            if (c.getResponseCode() != 200) throw new IOException("o GitHub respondeu " + c.getResponseCode());
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                got += n;
                if (got > r.size) throw new IOException("o arquivo baixado é maior que o anunciado");
                out.write(buf, 0, n);
                sha.update(buf, 0, n);
                synchronized (this) {
                    progress = (int) (got * 100 / r.size);
                }
            }
        } catch (IOException e) {
            part.delete();
            throw new IOException("O download falhou: " + e.getMessage());
        } finally {
            c.disconnect();
        }
        String hash = hex(sha.digest());
        if (got != r.size || !hash.equals(r.sha256)) {
            part.delete();
            throw new IOException("O arquivo baixado não confere com a versão publicada (SHA-256). Nada foi instalado.");
        }
        if (!part.renameTo(done)) throw new IOException("não consegui guardar a atualização");
        return done;
    }

    private static byte[] fetch(String url, int max) throws IOException {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream()) {
            if (c.getResponseCode() != 200) throw new IOException("o GitHub respondeu " + c.getResponseCode());
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                b.write(buf, 0, n);
                if (b.size() > max) throw new IOException("resposta grande demais");
            }
            return b.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(30_000);
        c.setInstanceFollowRedirects(true); // GitHub sends release files from another host (https -> https)
        c.setRequestProperty("User-Agent", "TV-Drop-Updater");
        return c;
    }

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }
}
