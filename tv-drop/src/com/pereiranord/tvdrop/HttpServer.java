package com.pereiranord.tvdrop;

import android.content.Context;
import android.media.AudioManager;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Tiny HTTP server, no libraries. Routes:
 *   GET  /                    web page (assets/index.html)
 *   GET  /api/status          JSON with address, files, permissions and log
 *   POST /api/upload?name=&auto=1   raw file body; auto plays videos / installs APKs
 *   POST /api/play            body = URL, or ?file=name for a received file
 *   POST /api/install?file=   install a received APK
 *   POST /api/delete?file=    delete a received file
 *   POST /api/control?cmd=    toggle | stop | fwd | back | volup | voldown | mute
 */
public class HttpServer extends Thread {
    private static final int FIRST_PORT = 8080;
    private final Context ctx;
    private ServerSocket socket;
    private volatile boolean running = true;

    public HttpServer(Context ctx) {
        super("tvdrop-http");
        this.ctx = ctx;
    }

    public boolean open() {
        for (int p = FIRST_PORT; p < FIRST_PORT + 10; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new java.net.InetSocketAddress(p));
                socket = s;
                return true;
            } catch (IOException ignored) {
            }
        }
        Events.add("Nenhuma porta livre entre 8080 e 8089");
        return false;
    }

    public int port() {
        return socket == null ? 0 : socket.getLocalPort();
    }

    public void shutdown() {
        running = false;
        try {
            socket.close();
        } catch (Exception ignored) {
        }
    }

    @Override
    public void run() {
        while (running) {
            try {
                final Socket c = socket.accept();
                new Thread(() -> serve(c), "tvdrop-conn").start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    // ---- request handling ----

    private void serve(Socket c) {
        try (Socket s = c) {
            s.setSoTimeout(120_000);
            InputStream in = new BufferedInputStream(s.getInputStream(), 64 * 1024);
            OutputStream out = s.getOutputStream();
            String line = readLine(in);
            if (line == null || line.isEmpty()) return;
            String[] parts = line.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String target = parts[1];

            Map<String, String> headers = new HashMap<>();
            String h;
            while ((h = readLine(in)) != null && !h.isEmpty()) {
                int i = h.indexOf(':');
                if (i > 0) headers.put(h.substring(0, i).trim().toLowerCase(Locale.ROOT), h.substring(i + 1).trim());
            }
            long length = 0;
            try {
                length = Long.parseLong(headers.getOrDefault("content-length", "0"));
            } catch (NumberFormatException ignored) {
            }

            String path = target;
            Map<String, String> q = new HashMap<>();
            int qi = target.indexOf('?');
            if (qi >= 0) {
                path = target.substring(0, qi);
                for (String kv : target.substring(qi + 1).split("&")) {
                    int e = kv.indexOf('=');
                    if (e > 0) q.put(dec(kv.substring(0, e)), dec(kv.substring(e + 1)));
                    else if (!kv.isEmpty()) q.put(dec(kv), "");
                }
            }

            try {
                route(method, path, q, in, length, out);
            } catch (Exception e) {
                Events.add("Erro: " + e.getMessage());
                send(out, 500, "text/plain; charset=utf-8", ("Erro: " + e.getMessage()).getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException ignored) {
        }
    }

    private void route(String method, String path, Map<String, String> q, InputStream in, long len, OutputStream out)
            throws IOException {
        if ("GET".equals(method) && ("/".equals(path) || "/index.html".equals(path))) {
            send(out, 200, "text/html; charset=utf-8", readAsset("index.html"));
            return;
        }
        if ("GET".equals(method) && "/api/status".equals(path)) {
            json(out, 200, status());
            return;
        }
        if (!"POST".equals(method)) {
            send(out, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        switch (path) {
            case "/api/upload": {
                String name = safeName(q.get("name"));
                if (name == null) { fail(out, "Nome de arquivo inválido"); return; }
                File f = new File(Actions.inbox(ctx), name);
                Events.add("Recebendo: " + name + " (" + mb(len) + ")");
                long got = copy(in, f, len);
                if (got != len) {
                    f.delete();
                    fail(out, "Envio incompleto");
                    Events.add("Envio incompleto: " + name);
                    return;
                }
                Events.add("Recebido: " + name);
                String extra = "";
                if (q.containsKey("auto")) {
                    if (Actions.isApk(name)) { Actions.install(ctx, f); extra = " Confirme a instalação na TV."; }
                    else if (Actions.isVideo(name)) { Actions.play(ctx, f.getAbsolutePath()); extra = " Tocando na TV."; }
                }
                ok(out, "Arquivo recebido." + extra);
                return;
            }
            case "/api/play": {
                String file = q.get("file");
                if (file != null) {
                    File f = existing(file);
                    if (f == null) { fail(out, "Arquivo não encontrado"); return; }
                    Actions.play(ctx, f.getAbsolutePath());
                } else {
                    String url = new String(readBody(in, len), StandardCharsets.UTF_8).trim();
                    if (!url.matches("(?i)^(https?|rtsp|rtmp)://\\S+$")) { fail(out, "Link inválido"); return; }
                    Actions.play(ctx, url);
                }
                ok(out, "Tocando na TV.");
                return;
            }
            case "/api/install": {
                File f = existing(q.get("file"));
                if (f == null || !Actions.isApk(f.getName())) { fail(out, "APK não encontrado"); return; }
                Actions.install(ctx, f);
                ok(out, "Confirme a instalação na TV.");
                return;
            }
            case "/api/delete": {
                File f = existing(q.get("file"));
                if (f == null) { fail(out, "Arquivo não encontrado"); return; }
                boolean d = f.delete();
                Events.add((d ? "Apagado: " : "Não consegui apagar: ") + f.getName());
                ok(out, d ? "Apagado." : "Não consegui apagar.");
                return;
            }
            case "/api/control": {
                String cmd = q.getOrDefault("cmd", "");
                AudioManager am = ctx.getSystemService(AudioManager.class);
                switch (cmd) {
                    case "volup": am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI); break;
                    case "voldown": am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI); break;
                    case "mute": am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_TOGGLE_MUTE, AudioManager.FLAG_SHOW_UI); break;
                    default:
                        if (!PlayerActivity.control(cmd)) { fail(out, "Nada tocando agora"); return; }
                }
                ok(out, "OK");
                return;
            }
            default:
                send(out, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
        }
    }

    // ---- helpers ----

    private String status() {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"ip\":").append(js(Actions.ip())).append(',');
        sb.append("\"port\":").append(port()).append(',');
        sb.append("\"canInstall\":").append(Actions.canInstall(ctx)).append(',');
        sb.append("\"canOverlay\":").append(Actions.canOverlay(ctx)).append(',');
        sb.append("\"playing\":").append(js(PlayerActivity.nowPlaying())).append(',');
        sb.append("\"files\":[");
        File[] files = Actions.inbox(ctx).listFiles();
        if (files != null) {
            Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (int i = 0; i < files.length; i++) {
                if (i > 0) sb.append(',');
                File f = files[i];
                String kind = Actions.isApk(f.getName()) ? "apk" : Actions.isVideo(f.getName()) ? "video" : "other";
                sb.append("{\"name\":").append(js(f.getName()))
                        .append(",\"size\":").append(f.length())
                        .append(",\"kind\":").append(js(kind)).append('}');
            }
        }
        sb.append("],\"log\":[");
        List<String> log = Events.snapshot();
        for (int i = 0; i < log.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(js(log.get(i)));
        }
        sb.append("]}");
        return sb.toString();
    }

    private File existing(String name) {
        String n = safeName(name);
        if (n == null) return null;
        File f = new File(Actions.inbox(ctx), n);
        return f.isFile() ? f : null;
    }

    /** Keeps only a plain file name: no folders, no hidden files. */
    static String safeName(String name) {
        if (name == null) return null;
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        String n = name.substring(slash + 1).replaceAll("[\\p{Cntrl}:*?\"<>|]", "_").trim();
        while (n.startsWith(".")) n = n.substring(1);
        if (n.isEmpty() || n.length() > 200) return null;
        return n;
    }

    private static long copy(InputStream in, File f, long len) throws IOException {
        long got = 0;
        byte[] buf = new byte[256 * 1024];
        try (OutputStream o = new FileOutputStream(f)) {
            while (got < len) {
                int n = in.read(buf, 0, (int) Math.min(buf.length, len - got));
                if (n < 0) break;
                o.write(buf, 0, n);
                got += n;
            }
        }
        return got;
    }

    private static byte[] readBody(InputStream in, long len) throws IOException {
        if (len > 64 * 1024) throw new IOException("corpo grande demais");
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        long got = 0;
        while (got < len) {
            int n = in.read(buf, 0, (int) Math.min(buf.length, len - got));
            if (n < 0) break;
            b.write(buf, 0, n);
            got += n;
        }
        return b.toByteArray();
    }

    private byte[] readAsset(String name) throws IOException {
        try (InputStream a = ctx.getAssets().open(name)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = a.read(buf)) > 0) b.write(buf, 0, n);
            return b.toByteArray();
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 16 * 1024) throw new IOException("linha grande demais");
        }
        if (c == -1 && b.size() == 0) return null;
        return b.toString("UTF-8");
    }

    private static String dec(String s) {
        try {
            return URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    private static String mb(long n) {
        return String.format(Locale.ROOT, "%.1f MB", n / 1048576.0);
    }

    static String js(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20 || ch == '<' || ch == '>') sb.append(String.format(Locale.ROOT, "\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        return sb.append('"').toString();
    }

    private static void ok(OutputStream out, String msg) throws IOException {
        json(out, 200, "{\"ok\":true,\"message\":" + js(msg) + "}");
    }

    private static void fail(OutputStream out, String msg) throws IOException {
        json(out, 400, "{\"ok\":false,\"message\":" + js(msg) + "}");
    }

    private static void json(OutputStream out, int code, String body) throws IOException {
        send(out, code, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private static void send(OutputStream out, int code, String type, byte[] body) throws IOException {
        String reason = code == 200 ? "OK" : code == 400 ? "Bad Request" : code == 404 ? "Not Found" : "Error";
        String head = "HTTP/1.1 " + code + " " + reason + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }
}
