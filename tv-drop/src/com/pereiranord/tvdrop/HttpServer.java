package com.pereiranord.tvdrop;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The TV's HTTP server (no libraries).
 *
 * TV Drop 1.0 routes, kept as they were:
 *   GET  /api/hello           {"app":"tvdrop","name":..,"code":..} used by the phone app to find the TV
 *   GET  /api/status          address, files, permissions, player state and log
 *   POST /api/upload?name=&auto=1   raw file body; auto plays videos / installs APKs
 *   POST /api/play            body = URL, or ?file=name for a received file
 *   POST /api/install?file=   install a received APK
 *   POST /api/delete?file=    delete a received file
 *   POST /api/control?cmd=    toggle | stop | fwd | back | seek&ms= | external | volup | voldown | mute
 *
 * TV Drop 2.0 routes live under /api/v2 (see ApiV2). Every /api route except
 * /api/hello, /api/v2/info and /api/v2/pair needs a paired device's token, unless
 * "legacyOpen" is on, which lets 1.0 apps use the 1.0 routes without pairing.
 */
public class HttpServer extends Thread {
    public static final int FIRST_PORT = 8080;
    static final Set<String> LEGACY = new HashSet<>(Arrays.asList(
            "/api/status", "/api/upload", "/api/play", "/api/install", "/api/delete", "/api/control"));
    static final Set<String> OPEN = new HashSet<>(Arrays.asList("/api/hello", "/api/v2/info", "/api/v2/pair"));

    private final TvHost host;
    private final Pairing pairing;
    private final ApiV2 v2;
    private ServerSocket socket;
    private volatile boolean running = true;

    public HttpServer(TvHost host, Pairing pairing) {
        super("tvdrop-http");
        this.host = host;
        this.pairing = pairing;
        this.v2 = new ApiV2(host, pairing, this);
    }

    /** Binds the first free port from 8080 to 8089 (all interfaces). */
    public boolean open() {
        return open(FIRST_PORT, 10);
    }

    boolean open(int first, int tries) {
        for (int p = first; p < first + tries; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                socket = s;
                return true;
            } catch (IOException ignored) {
            }
        }
        Events.add("Nenhuma porta livre entre " + first + " e " + (first + tries - 1));
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
            Http.Request r = Http.Request.read(in, out);
            if (r == null) return;
            r.remoteIp = s.getInetAddress() == null ? "" : s.getInetAddress().getHostAddress();
            if (!isLocal(s)) {
                Http.error(out, 403, "forbidden", "O TV Drop só aceita aparelhos da rede local.");
                return;
            }
            try {
                route(r, s);
            } catch (Exception e) {
                Events.add("Erro: " + e.getMessage());
                Http.error(out, 500, "internal", "Erro: " + e.getMessage());
            }
        } catch (IOException ignored) {
        }
    }

    /** Private, link-local and loopback addresses only: the server is never meant to face the internet. */
    static boolean isLocal(Socket s) {
        java.net.InetAddress a = s.getInetAddress();
        if (a == null) return false;
        if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress()) return true;
        byte[] b = a.getAddress();
        if (b.length == 4) return (b[0] & 0xff) == 100 && (b[1] & 0xc0) == 64; // 100.64.0.0/10 (CGNAT/hotspots)
        return (b[0] & 0xfe) == 0xfc; // IPv6 unique local fc00::/7
    }

    private void route(Http.Request r, Socket s) throws IOException {
        OutputStream out = r.out;
        String path = r.path;

        // Web pages and their files (no token needed: they hold no data)
        if ("GET".equals(r.method) && !path.startsWith("/api/")) {
            serveWeb(r);
            return;
        }

        if (!OPEN.contains(path)) {
            Pairing.Device d = pairing.check(r.token());
            boolean legacyAllowed = LEGACY.contains(path) && pairing.legacyOpen();
            if (d == null && !legacyAllowed) {
                Http.error(out, 401, "unauthorized",
                        "Este aparelho ainda não foi pareado. Digite o código de 6 números que aparece na TV.");
                return;
            }
        }

        if (path.startsWith("/api/v2/")) {
            v2.route(r, s);
            return;
        }
        legacy(r);
    }

    private void serveWeb(Http.Request r) throws IOException {
        String p = r.path;
        if ("/".equals(p) || "/index.html".equals(p)) p = "/index.html";
        String name = p.substring(1);
        if (!name.matches("[A-Za-z0-9_-]+(\\.[A-Za-z0-9]+)+") ) {
            Http.send(r.out, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        byte[] data = host.webAsset(name);
        if (data == null) {
            Http.send(r.out, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        Http.send(r.out, 200, Http.contentType(name), data,
                name.endsWith(".html") ? "Content-Security-Policy: frame-ancestors 'self'\r\n" : null);
    }

    // ---- TV Drop 1.0 routes (unchanged behaviour) ----

    private void legacy(Http.Request r) throws IOException {
        OutputStream out = r.out;
        if ("GET".equals(r.method) && "/api/hello".equals(r.path)) {
            Http.json(out, 200, "{\"app\":\"tvdrop\",\"name\":" + Http.js(tvName()) + ",\"code\":" + Http.js(code())
                    + ",\"api\":2}");
            return;
        }
        if ("GET".equals(r.method) && "/api/status".equals(r.path)) {
            Http.json(out, 200, status());
            return;
        }
        if (!"POST".equals(r.method)) {
            Http.send(out, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        switch (r.path) {
            case "/api/upload": {
                String name = uniqueName(safeName(r.query.get("name")), r.query.containsKey("replace"));
                if (name == null) { Http.fail(out, "Nome de arquivo inválido"); return; }
                File f = new File(host.inbox(), name);
                Events.add("Recebendo: " + name + " (" + mb(r.length) + ")");
                long got = copy(r.in, f, r.length);
                if (got != r.length) {
                    f.delete();
                    Http.fail(out, "Envio incompleto");
                    Events.add("Envio incompleto: " + name);
                    return;
                }
                Events.add("Recebido: " + name);
                String extra = "";
                if (r.query.containsKey("auto")) {
                    if (Actions.isApk(name)) { host.install(f); extra = " Confirme a instalação na TV."; }
                    else if (Actions.isVideo(name)) { host.play(f.getAbsolutePath()); extra = " Tocando na TV."; }
                }
                Http.json(out, 200, "{\"ok\":true,\"message\":" + Http.js("Arquivo recebido." + extra)
                        + ",\"name\":" + Http.js(name) + "}");
                return;
            }
            case "/api/play": {
                String file = r.query.get("file");
                if (file != null) {
                    File f = existing(file);
                    if (f == null) { Http.fail(out, "Arquivo não encontrado"); return; }
                    host.play(f.getAbsolutePath());
                } else {
                    String url = r.bodyText().trim();
                    if (!url.matches("(?i)^(https?|rtsp|rtmp)://\\S+$")) { Http.fail(out, "Link inválido"); return; }
                    host.play(url);
                }
                Http.ok(out, "Tocando na TV.");
                return;
            }
            case "/api/install": {
                File f = existing(r.query.get("file"));
                if (f == null || !Actions.isApk(f.getName())) { Http.fail(out, "APK não encontrado"); return; }
                host.install(f);
                Http.ok(out, "Confirme a instalação na TV.");
                return;
            }
            case "/api/delete": {
                File f = existing(r.query.get("file"));
                if (f == null) { Http.fail(out, "Arquivo não encontrado"); return; }
                boolean d = f.delete();
                Events.add((d ? "Apagado: " : "Não consegui apagar: ") + f.getName());
                Http.ok(out, d ? "Apagado." : "Não consegui apagar.");
                return;
            }
            case "/api/control": {
                String cmd = r.query.getOrDefault("cmd", "");
                switch (cmd) {
                    case "volup": host.volume("up"); break;
                    case "voldown": host.volume("down"); break;
                    case "mute": host.volume("mute"); break;
                    default:
                        long arg = 0;
                        try { arg = Long.parseLong(r.query.getOrDefault("ms", "0")); } catch (NumberFormatException ignored) {}
                        if (!host.playerControl(cmd, arg)) { Http.fail(out, "Nada tocando agora"); return; }
                }
                Http.ok(out, "OK");
                return;
            }
            default:
                Http.send(out, 404, "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
        }
    }

    // ---- helpers ----

    String status() {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"ip\":").append(Http.js(host.ip())).append(',');
        sb.append("\"port\":").append(port()).append(',');
        sb.append("\"canInstall\":").append(host.canInstall()).append(',');
        sb.append("\"canOverlay\":").append(host.canOverlay()).append(',');
        sb.append("\"name\":").append(Http.js(tvName())).append(',');
        sb.append("\"code\":").append(Http.js(code())).append(',');
        sb.append("\"playing\":").append(Http.js(host.nowPlaying())).append(',');
        sb.append("\"position\":").append(host.position()).append(',');
        sb.append("\"duration\":").append(host.duration()).append(',');
        sb.append("\"paused\":").append(host.paused()).append(',');
        sb.append("\"audio\":").append(Http.js(host.audioInfo())).append(',');
        sb.append("\"externalPlayer\":").append(Http.js(host.externalPlayerName())).append(',');
        sb.append("\"files\":[");
        File[] files = host.inbox().listFiles();
        if (files != null) {
            Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (int i = 0; i < files.length; i++) {
                if (i > 0) sb.append(',');
                File f = files[i];
                sb.append("{\"name\":").append(Http.js(f.getName()))
                        .append(",\"size\":").append(f.length())
                        .append(",\"kind\":").append(Http.js(kind(f.getName())))
                        .append(",\"modified\":").append(f.lastModified()).append('}');
            }
        }
        sb.append("],\"log\":[");
        List<String> log = Events.snapshot();
        for (int i = 0; i < log.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(Http.js(log.get(i)));
        }
        sb.append("]}");
        return sb.toString();
    }

    static String kind(String name) {
        if (Actions.isApk(name)) return "apk";
        if (Actions.isVideo(name)) {
            String n = name.toLowerCase(Locale.ROOT);
            return n.matches(".*\\.(mp3|m4a|aac|flac|wav|ogg)$") ? "audio" : "video";
        }
        String n = name.toLowerCase(Locale.ROOT);
        if (n.matches(".*\\.(jpe?g|png|gif|webp|heic|bmp)$")) return "image";
        if (n.matches(".*\\.(pdf|docx?|xlsx?|pptx?|txt|odt|ods|odp|csv)$")) return "document";
        return "other";
    }

    String code() {
        return Codes.encode(host.ip(), port());
    }

    String tvName() {
        String m = host.model();
        return "TV Drop" + (m == null || m.isEmpty() ? "" : " (" + m + ")");
    }

    File existing(String name) {
        String n = safeName(name);
        if (n == null) return null;
        File f = new File(host.inbox(), n);
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

    /** "foto.jpg" -> "foto (2).jpg" when a file with that name is already there (unless ?replace). */
    String uniqueName(String name, boolean replace) {
        if (name == null || replace) return name;
        File dir = host.inbox();
        if (!new File(dir, name).exists()) return name;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; i < 1000; i++) {
            String n = base + " (" + i + ")" + ext;
            if (!new File(dir, n).exists()) return n;
        }
        return name;
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

    private static String mb(long n) {
        return String.format(Locale.ROOT, "%.1f MB", n / 1048576.0);
    }
}
