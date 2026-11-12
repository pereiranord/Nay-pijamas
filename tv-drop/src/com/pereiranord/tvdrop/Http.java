package com.pereiranord.tvdrop;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Request parsing, response writing and a minimal WebSocket (RFC 6455) for the TV's server. */
final class Http {
    private Http() {}

    static final class Request {
        String method;
        String target;
        String path;
        final Map<String, String> query = new HashMap<>();
        final Map<String, String> headers = new HashMap<>();
        InputStream in;
        OutputStream out;
        long length;
        String remoteIp = "";

        static Request read(InputStream in, OutputStream out) throws IOException {
            String line = readLine(in);
            if (line == null || line.isEmpty()) return null;
            String[] parts = line.split(" ");
            if (parts.length < 2) return null;
            Request r = new Request();
            r.in = in;
            r.out = out;
            r.method = parts[0];
            r.target = parts[1];
            String h;
            while ((h = readLine(in)) != null && !h.isEmpty()) {
                int i = h.indexOf(':');
                if (i > 0) r.headers.put(h.substring(0, i).trim().toLowerCase(Locale.ROOT), h.substring(i + 1).trim());
            }
            try {
                r.length = Long.parseLong(r.headers.getOrDefault("content-length", "0"));
            } catch (NumberFormatException e) {
                r.length = 0;
            }
            r.path = r.target;
            int qi = r.target.indexOf('?');
            if (qi >= 0) {
                r.path = r.target.substring(0, qi);
                for (String kv : r.target.substring(qi + 1).split("&")) {
                    int e = kv.indexOf('=');
                    if (e > 0) r.query.put(dec(kv.substring(0, e)), dec(kv.substring(e + 1)));
                    else if (!kv.isEmpty()) r.query.put(dec(kv), "");
                }
            }
            return r;
        }

        String header(String name) {
            return headers.get(name.toLowerCase(Locale.ROOT));
        }

        /** Token from "X-TVDrop-Token", "Authorization: Bearer ..." or ?token= (for <img> and WebSocket). */
        String token() {
            String t = header("x-tvdrop-token");
            if (t != null && !t.isEmpty()) return t.trim();
            String a = header("authorization");
            if (a != null && a.regionMatches(true, 0, "Bearer ", 0, 7)) return a.substring(7).trim();
            return query.get("token");
        }

        byte[] body(int max) throws IOException {
            if (length > max) throw new IOException("corpo grande demais");
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            long got = 0;
            while (got < length) {
                int n = in.read(buf, 0, (int) Math.min(buf.length, length - got));
                if (n < 0) break;
                b.write(buf, 0, n);
                got += n;
            }
            return b.toByteArray();
        }

        String bodyText() throws IOException {
            return new String(body(64 * 1024), StandardCharsets.UTF_8);
        }

        /** JSON body, or an empty object when the body is empty or not JSON. */
        JSONObject json() throws IOException {
            String s = bodyText().trim();
            if (s.isEmpty()) return new JSONObject();
            try {
                return new JSONObject(s);
            } catch (JSONException e) {
                return new JSONObject();
            }
        }
    }

    // ---- responses ----

    static void send(OutputStream out, int code, String type, byte[] body) throws IOException {
        send(out, code, type, body, null);
    }

    static void send(OutputStream out, int code, String type, byte[] body, String extraHeaders) throws IOException {
        String head = "HTTP/1.1 " + code + " " + reason(code) + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + CORS
                + (extraHeaders == null ? "" : extraHeaders)
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    /**
     * Lets the standalone index.html (opened from a file or another local address) call the TV.
     * Safe because every route that does something needs a pairing token, which other sites don't have.
     */
    static final String CORS = "Access-Control-Allow-Origin: *\r\n"
            + "Access-Control-Allow-Headers: X-TVDrop-Token, Content-Type, Authorization\r\n"
            + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            + "Access-Control-Allow-Private-Network: true\r\n"
            + "Access-Control-Max-Age: 600\r\n";

    static void preflight(OutputStream out) throws IOException {
        out.write(("HTTP/1.1 204 No Content\r\n" + CORS + "Content-Length: 0\r\nConnection: close\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    /** True when the request comes from a page that the TV itself did not serve. */
    static boolean crossOrigin(Request r) {
        String origin = r.header("origin");
        if (origin == null) return false;
        String host = r.header("host");
        return host == null || !(origin.equals("http://" + host) || origin.equals("https://" + host));
    }

    static void json(OutputStream out, int code, String body) throws IOException {
        send(out, code, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    static void json(OutputStream out, int code, JSONObject o) throws IOException {
        json(out, code, o.toString());
    }

    static void ok(OutputStream out, String msg) throws IOException {
        json(out, 200, "{\"ok\":true,\"message\":" + js(msg) + "}");
    }

    static void fail(OutputStream out, String msg) throws IOException {
        error(out, 400, "bad_request", msg);
    }

    static void error(OutputStream out, int code, String error, String msg) throws IOException {
        json(out, code, "{\"ok\":false,\"error\":" + js(error) + ",\"message\":" + js(msg) + "}");
    }

    static String reason(int code) {
        switch (code) {
            case 101: return "Switching Protocols";
            case 200: return "OK";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 409: return "Conflict";
            case 413: return "Payload Too Large";
            case 429: return "Too Many Requests";
            case 501: return "Not Implemented";
            case 507: return "Insufficient Storage";
            case 503: return "Service Unavailable";
            default: return "Error";
        }
    }

    static String contentType(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".json") || n.endsWith(".webmanifest")) return "application/json; charset=utf-8";
        return "application/octet-stream";
    }

    // ---- small utilities ----

    static String readLine(InputStream in) throws IOException {
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

    static String dec(String s) {
        try {
            return URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
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

    // ---- WebSocket ----

    /** One WebSocket connection: text frames only (control frames handled here). */
    static final class WebSocket {
        private static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        private final InputStream in;
        private final OutputStream out;

        private WebSocket(InputStream in, OutputStream out) {
            this.in = in;
            this.out = out;
        }

        static boolean isUpgrade(Request r) {
            String up = r.header("upgrade");
            return up != null && up.equalsIgnoreCase("websocket") && r.header("sec-websocket-key") != null;
        }

        static WebSocket accept(Request r) throws IOException {
            String key = r.header("sec-websocket-key");
            String accept;
            try {
                accept = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1")
                        .digest((key + GUID).getBytes(StandardCharsets.US_ASCII)));
            } catch (Exception e) {
                throw new IOException(e);
            }
            String head = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
            r.out.write(head.getBytes(StandardCharsets.US_ASCII));
            r.out.flush();
            return new WebSocket(r.in, r.out);
        }

        static String acceptKey(String key) throws Exception {
            return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1")
                    .digest((key + GUID).getBytes(StandardCharsets.US_ASCII)));
        }

        /** Next text message, or null when the peer closed the connection. */
        String receive() throws IOException {
            ByteArrayOutputStream msg = new ByteArrayOutputStream();
            while (true) {
                int b0 = readByte(), b1 = readByte();
                boolean fin = (b0 & 0x80) != 0;
                int op = b0 & 0x0f;
                boolean masked = (b1 & 0x80) != 0;
                long len = b1 & 0x7f;
                if (len == 126) len = (readByte() << 8) | readByte();
                else if (len == 127) {
                    len = 0;
                    for (int i = 0; i < 8; i++) len = (len << 8) | readByte();
                }
                if (len > 1 << 20) throw new IOException("mensagem grande demais");
                byte[] mask = new byte[4];
                if (masked) for (int i = 0; i < 4; i++) mask[i] = (byte) readByte();
                byte[] data = new byte[(int) len];
                for (int i = 0; i < len; i++) data[i] = (byte) (readByte() ^ (masked ? mask[i & 3] : 0));
                if (op == 0x8) { // close
                    frame(0x8, data);
                    return null;
                }
                if (op == 0x9) { // ping
                    frame(0xA, data);
                    continue;
                }
                if (op == 0xA) continue; // pong
                msg.write(data);
                if (fin) return msg.toString("UTF-8");
            }
        }

        synchronized void sendText(String s) throws IOException {
            frame(0x1, s.getBytes(StandardCharsets.UTF_8));
        }

        private synchronized void frame(int op, byte[] data) throws IOException {
            ByteArrayOutputStream f = new ByteArrayOutputStream();
            f.write(0x80 | op);
            if (data.length < 126) f.write(data.length);
            else if (data.length < 65536) {
                f.write(126);
                f.write(data.length >> 8);
                f.write(data.length & 0xff);
            } else {
                f.write(127);
                for (int i = 7; i >= 0; i--) f.write((int) ((long) data.length >> (8 * i)) & 0xff);
            }
            f.write(data);
            out.write(f.toByteArray());
            out.flush();
        }

        /** Says goodbye and drops the connection (also unblocks a thread waiting in receive()). */
        void close() {
            try { frame(0x8, new byte[0]); } catch (IOException ignored) { }
            try { in.close(); } catch (IOException ignored) { }
            try { out.close(); } catch (IOException ignored) { }
        }

        private int readByte() throws IOException {
            int b = in.read();
            if (b < 0) throw new EOFException();
            return b;
        }
    }
}
