package com.pereiranord.tvdrop;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Random;

/** Starts a real HttpServer on a free local port, backed by FakeHost. */
public abstract class ServerTestBase {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    FakeHost host;
    Pairing pairing;
    HttpServer server;
    String base;

    static final class Res {
        final int code;
        final String body;
        final byte[] bytes;

        Res(int code, byte[] bytes) {
            this.code = code;
            this.bytes = bytes;
            this.body = new String(bytes, StandardCharsets.UTF_8);
        }
    }

    @Before
    public void startServer() throws Exception {
        host = new FakeHost(tmp.newFolder("inbox"));
        pairing = new Pairing(new KeyValueStore.Memory());
        server = new HttpServer(host, pairing);
        int first = 20000 + new Random().nextInt(30000);
        if (!server.open(first, 50)) throw new IllegalStateException("no free port");
        server.start();
        base = "http://127.0.0.1:" + server.port();
    }

    @After
    public void stopServer() {
        server.shutdown();
    }

    /** Pairs a device through the API and returns its token. */
    String pair() throws Exception {
        Res r = req("POST", "/api/v2/pair", "{\"pin\":\"" + pairing.pin() + "\",\"name\":\"Teste\"}", null);
        if (r.code != 200) throw new IllegalStateException(r.body);
        return new org.json.JSONObject(r.body).getString("token");
    }

    Res req(String method, String path, String body, String token) throws IOException {
        return req(method, path, body == null ? null : body.getBytes(StandardCharsets.UTF_8), token);
    }

    Res req(String method, String path, byte[] body, String token) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(3000);
        c.setReadTimeout(10000);
        if (token != null) c.setRequestProperty("X-TVDrop-Token", token);
        if (body != null) {
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(body.length);
            try (OutputStream o = c.getOutputStream()) {
                o.write(body);
            }
        }
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (in != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            in.close();
        }
        c.disconnect();
        return new Res(code, b.toByteArray());
    }
}
