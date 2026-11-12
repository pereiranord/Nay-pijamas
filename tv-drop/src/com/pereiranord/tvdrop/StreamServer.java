package com.pereiranord.tvdrop;

import android.content.ContentResolver;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Runs on the phone. Serves ONE picked file at a secret path with HTTP Range
 * support, so the TV's player reads it straight from the phone: nothing is
 * copied first, and seeking works. The bytes are the original file, so the
 * quality is the original quality.
 */
public class StreamServer extends Thread {
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private final ContentResolver resolver;
    private ServerSocket socket;
    private volatile boolean running = true;
    /** Files being served, by secret token (the newest 50, so a queue of phone videos keeps working). */
    private final java.util.LinkedHashMap<String, Object[]> files = new java.util.LinkedHashMap<String, Object[]>() {
        @Override
        protected boolean removeEldestEntry(java.util.Map.Entry<String, Object[]> e) {
            return size() > 50;
        }
    };

    public StreamServer(ContentResolver resolver) {
        super("tvdrop-stream");
        this.resolver = resolver;
    }

    public void open() throws IOException {
        ServerSocket s = new ServerSocket();
        s.setReuseAddress(true);
        s.bind(new InetSocketAddress(0));
        socket = s;
    }

    public int port() {
        return socket.getLocalPort();
    }

    /** Adds a file and returns its secret path, e.g. "/s/ab12.../video.mp4". */
    public String serve(Uri u, String type, String name) {
        byte[] b = new byte[12];
        new SecureRandom().nextBytes(b);
        StringBuilder t = new StringBuilder();
        for (byte x : b) t.append(String.format(Locale.ROOT, "%02x", x));
        synchronized (files) {
            files.put(t.toString(), new Object[]{u, type == null ? "video/mp4" : type});
        }
        String safe = name == null ? "video" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return "/s/" + t + "/" + safe;
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
                Socket c = socket.accept();
                new Thread(() -> handle(c), "tvdrop-stream-conn").start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket c) {
        try (Socket s = c) {
            s.setSoTimeout(60_000);
            s.setSendBufferSize(512 * 1024);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String line = readLine(in);
            if (line == null) return;
            String[] parts = line.split(" ");
            if (parts.length < 2) return;
            String method = parts[0], path = parts[1];
            String range = null, h;
            while ((h = readLine(in)) != null && !h.isEmpty()) {
                if (h.toLowerCase(Locale.ROOT).startsWith("range:")) range = h.substring(6).trim();
            }
            Uri u = null;
            String mime = "video/mp4";
            if (path.startsWith("/s/")) {
                int end = path.indexOf('/', 3);
                String tok = end > 3 ? path.substring(3, end) : "";
                synchronized (files) {
                    Object[] f = files.get(tok);
                    if (f != null) { u = (Uri) f[0]; mime = (String) f[1]; }
                }
            }
            if (u == null) {
                head(out, "404 Not Found", "text/plain", 0, null);
                return;
            }
            boolean headOnly = "HEAD".equals(method);
            if (!headOnly && !"GET".equals(method)) {
                head(out, "405 Method Not Allowed", "text/plain", 0, null);
                return;
            }
            ParcelFileDescriptor pfd = resolver.openFileDescriptor(u, "r");
            if (pfd == null) throw new IOException("arquivo não abre");
            try (FileInputStream fis = new ParcelFileDescriptor.AutoCloseInputStream(pfd)) {
                long total = pfd.getStatSize();
                long start = 0, end = total - 1;
                boolean partial = false;
                if (range != null && total > 0) {
                    Matcher m = RANGE.matcher(range);
                    if (m.matches()) {
                        String a = m.group(1), b = m.group(2);
                        if (a.isEmpty() && !b.isEmpty()) {
                            start = Math.max(0, total - Long.parseLong(b));
                        } else if (!a.isEmpty()) {
                            start = Long.parseLong(a);
                            if (!b.isEmpty()) end = Math.min(end, Long.parseLong(b));
                        }
                        if (start >= total || start > end) {
                            head(out, "416 Range Not Satisfiable", mime, 0, "bytes */" + total);
                            return;
                        }
                        partial = true;
                    }
                }
                long len = total < 0 ? -1 : end - start + 1;
                head(out, partial ? "206 Partial Content" : "200 OK", mime, len,
                        partial ? "bytes " + start + "-" + end + "/" + total : null);
                if (headOnly) return;
                FileChannel ch = fis.getChannel();
                ch.position(start);
                byte[] buf = new byte[256 * 1024];
                long left = len < 0 ? Long.MAX_VALUE : len;
                while (left > 0) {
                    int n = fis.read(buf, 0, (int) Math.min(buf.length, left));
                    if (n < 0) break;
                    out.write(buf, 0, n);
                    left -= n;
                }
                out.flush();
            }
        } catch (IOException ignored) {
            // The TV closes connections all the time while seeking; that's normal.
        }
    }

    private static void head(OutputStream out, String status, String type, long len, String contentRange)
            throws IOException {
        StringBuilder h = new StringBuilder("HTTP/1.1 ").append(status).append("\r\n")
                .append("Content-Type: ").append(type).append("\r\n")
                .append("Accept-Ranges: bytes\r\n")
                .append("Connection: close\r\n");
        if (len >= 0) h.append("Content-Length: ").append(len).append("\r\n");
        if (contentRange != null) h.append("Content-Range: ").append(contentRange).append("\r\n");
        h.append("\r\n");
        out.write(h.toString().getBytes(StandardCharsets.UTF_8));
        out.flush();
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
}
