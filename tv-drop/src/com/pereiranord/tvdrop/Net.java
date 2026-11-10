package com.pereiranord.tvdrop;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Phone -> TV HTTP calls. Call these off the main thread. */
public final class Net {
    private Net() {}

    public static String get(String url, int timeoutMs) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        try {
            return read(c);
        } finally {
            c.disconnect();
        }
    }

    public static String post(String url, String body) throws IOException {
        byte[] b = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(4000);
        c.setReadTimeout(15000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setFixedLengthStreamingMode(b.length);
        try {
            try (OutputStream o = c.getOutputStream()) {
                o.write(b);
            }
            return read(c);
        } finally {
            c.disconnect();
        }
    }

    public interface Progress {
        void on(long sent, long total);
    }

    /** Sends a file body (for APK upload). */
    public static String upload(String url, InputStream in, long len, Progress p) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(4000);
        c.setReadTimeout(60000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setFixedLengthStreamingMode(len);
        try {
            try (OutputStream o = c.getOutputStream()) {
                byte[] buf = new byte[128 * 1024];
                long sent = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    o.write(buf, 0, n);
                    sent += n;
                    if (p != null) p.on(sent, len);
                }
            }
            return read(c);
        } finally {
            c.disconnect();
        }
    }

    /** The phone's own address as seen on the route to the TV. */
    public static String localAddressTowards(String host, int port) throws IOException {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 3000);
            return s.getLocalAddress().getHostAddress();
        }
    }

    private static String read(HttpURLConnection c) throws IOException {
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) return "";
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = i.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    // --- tiny JSON readers for our own flat responses ---

    public static String str(String json, String key) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\":\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        if (!m.find()) return null;
        return m.group(1).replace("\\\"", "\"").replace("\\\\", "\\").replace("\\n", "\n");
    }

    public static long num(String json, String key, long def) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\":(-?\\d+)").matcher(json);
        return m.find() ? Long.parseLong(m.group(1)) : def;
    }

    public static boolean bool(String json, String key) {
        return json.contains("\"" + key + "\":true");
    }
}
