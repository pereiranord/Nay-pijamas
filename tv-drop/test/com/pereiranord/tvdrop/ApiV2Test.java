package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ApiV2Test extends ServerTestBase {

    @Test
    public void infoIsOpenAndTellsPairingIsRequired() throws Exception {
        Res r = req("GET", "/api/v2/info", (String) null, null);
        assertEquals(200, r.code);
        JSONObject o = new JSONObject(r.body);
        assertEquals("tvdrop", o.getString("app"));
        assertEquals(2, o.getInt("api"));
        assertEquals(31, o.getInt("sdk"));
        assertTrue(o.getBoolean("requiresPairing"));
    }

    @Test
    public void pairingWithWrongPinIsRefused() throws Exception {
        String wrong = pairing.pin().equals("000000") ? "111111" : "000000";
        Res r = req("POST", "/api/v2/pair", "{\"pin\":\"" + wrong + "\"}", null);
        assertEquals(403, r.code);
        assertEquals("bad_pin", new JSONObject(r.body).getString("error"));
    }

    @Test
    public void tokenWorksInHeaderBearerAndQuery() throws Exception {
        String t = pair();
        assertEquals(200, req("GET", "/api/v2/session", (String) null, t).code);
        assertEquals(200, req("GET", "/api/v2/session?token=" + t, (String) null, null).code);
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(base + "/api/v2/session").openConnection();
        c.setRequestProperty("Authorization", "Bearer " + t);
        assertEquals(200, c.getResponseCode());
        String tampered = (t.charAt(0) == '0' ? '1' : '0') + t.substring(1);
        assertEquals(401, req("GET", "/api/v2/session", (String) null, tampered).code);
    }

    @Test
    public void capabilitiesCombineRemoteAndTv() throws Exception {
        String t = pair();
        JSONObject c = new JSONObject(req("GET", "/api/v2/capabilities", (String) null, t).body);
        assertTrue(c.getBoolean("ok"));
        assertEquals(31, c.getInt("sdk"));
        assertTrue(c.getJSONObject("remote").getJSONArray("keys").toString().contains("up"));
        assertFalse(c.getJSONObject("remote").getBoolean("power"));
        assertTrue(c.getJSONObject("apps").getBoolean("launch"));
    }

    @Test
    public void keysTextAndPointerReachTheRemote() throws Exception {
        String t = pair();
        assertEquals(200, req("POST", "/api/v2/remote/key", "{\"key\":\"up\"}", t).code);
        assertEquals(200, req("POST", "/api/v2/remote/key", "{\"key\":\"ok\"}", t).code);
        Res power = req("POST", "/api/v2/remote/key", "{\"key\":\"power\"}", t);
        assertEquals("a refused key must not report success", 409, power.code);
        assertEquals(409, req("POST", "/api/v2/remote/key", "{\"key\":\"nope\"}", t).code);
        assertEquals(200, req("POST", "/api/v2/remote/text", "{\"text\":\"filmes de ação\",\"submit\":true}", t).code);
        assertEquals(200, req("POST", "/api/v2/remote/pointer", "{\"action\":\"move\",\"dx\":12,\"dy\":-4}", t).code);
        assertEquals("[up, ok]", host.remote.keys.toString());
        assertEquals("filmes de ação|submit", host.remote.texts.get(0));
        assertEquals("move:12,-4", host.remote.pointer.get(0));
    }

    @Test
    public void textIsLimited() throws Exception {
        String t = pair();
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 501; i++) big.append('a');
        assertEquals(400, req("POST", "/api/v2/remote/text", "{\"text\":\"" + big + "\"}", t).code);
    }

    @Test
    public void linksAreValidated() throws Exception {
        String t = pair();
        assertEquals(200, req("POST", "/api/v2/remote/link", "{\"link\":\"https://www.youtube.com\"}", t).code);
        assertEquals(400, req("POST", "/api/v2/remote/link", "{\"link\":\"file:///data/x\"}", t).code);
        assertEquals(400, req("POST", "/api/v2/remote/link", "{\"link\":\"javascript:alert(1)\"}", t).code);
    }

    @Test
    public void remotePairingPassesTheCodeThrough() throws Exception {
        String t = pair();
        assertEquals(200, req("POST", "/api/v2/remote/pair/start", "", t).code);
        assertEquals(409, req("POST", "/api/v2/remote/pair/finish", "{\"code\":\"FFFFFF\"}", t).code);
        assertEquals(200, req("POST", "/api/v2/remote/pair/finish", "{\"code\":\"ABC123\"}", t).code);
        assertEquals("ABC123", host.remote.pairedCode);
    }

    @Test
    public void appsListMatchesCatalogOnlyWhenInstalled() throws Exception {
        String t = pair();
        JSONObject o = new JSONObject(req("GET", "/api/v2/apps", (String) null, t).body);
        assertEquals(3, o.getJSONArray("apps").length());
        JSONArray cat = o.getJSONArray("catalog");
        JSONObject netflix = null, globo = null, disney = null;
        for (int i = 0; i < cat.length(); i++) {
            JSONObject e = cat.getJSONObject(i);
            if (e.getString("id").equals("netflix")) netflix = e;
            if (e.getString("id").equals("globoplay")) globo = e;
            if (e.getString("id").equals("disney")) disney = e;
        }
        assertEquals("com.netflix.ninja", netflix.getString("installed"));
        assertEquals("matched by name", "com.example.globo", globo.getString("installed"));
        assertTrue("not installed must be null", disney.isNull("installed"));
    }

    @Test
    public void launchOnlyInstalledApps() throws Exception {
        String t = pair();
        assertEquals(200, req("POST", "/api/v2/apps/launch", "{\"pkg\":\"com.netflix.ninja\"}", t).code);
        assertEquals(404, req("POST", "/api/v2/apps/launch", "{\"pkg\":\"com.disney.disneyplus\"}", t).code);
        assertEquals(400, req("POST", "/api/v2/apps/launch", "{\"pkg\":\"../evil\"}", t).code);
        assertEquals("[com.netflix.ninja]", host.launched.toString());
    }

    @Test
    public void iconsAcceptQueryToken() throws Exception {
        String t = pair();
        Res r = req("GET", "/api/v2/apps/icon?pkg=com.netflix.ninja&token=" + t, (String) null, null);
        assertEquals(200, r.code);
        assertEquals((byte) 0x89, r.bytes[0]);
        assertEquals(404, req("GET", "/api/v2/apps/icon?pkg=com.example.globo&token=" + t, (String) null, null).code);
        assertEquals(401, req("GET", "/api/v2/apps/icon?pkg=com.netflix.ninja", (String) null, null).code);
    }

    @Test
    public void devicesCanBeListedRenamedAndRevoked() throws Exception {
        String t = pair();
        JSONObject list = new JSONObject(req("GET", "/api/v2/devices", (String) null, t).body);
        JSONObject me = list.getJSONArray("devices").getJSONObject(0);
        assertTrue(me.getBoolean("current"));
        String id = me.getString("id");
        assertEquals(200, req("POST", "/api/v2/devices/rename", "{\"id\":\"" + id + "\",\"name\":\"Sala\"}", t).code);
        assertEquals("Sala", pairing.devices().get(0).name);
        assertEquals(200, req("POST", "/api/v2/devices/revoke", "{\"id\":\"" + id + "\"}", t).code);
        assertEquals(401, req("GET", "/api/v2/devices", (String) null, t).code);
    }

    @Test
    public void volumeBeepPingAndSpeed() throws Exception {
        String t = pair();
        assertEquals(200, req("POST", "/api/v2/volume", "{\"action\":\"up\"}", t).code);
        assertEquals(400, req("POST", "/api/v2/volume", "{\"action\":\"loud\"}", t).code);
        assertEquals(200, req("POST", "/api/v2/beep", "", t).code);
        assertEquals(1, host.beeps);
        assertEquals(200, req("GET", "/api/v2/ping", (String) null, t).code);
        assertEquals(1_000_000, req("GET", "/api/v2/speed?bytes=1000000", (String) null, t).bytes.length);
        JSONObject up = new JSONObject(req("POST", "/api/v2/speed", new byte[500_000], t).body);
        assertEquals(500_000, up.getLong("bytes"));
    }

    @Test
    public void webSocketCarriesKeysAndPointer() throws Exception {
        String t = pair();
        try (Socket s = new Socket("127.0.0.1", server.port())) {
            s.setSoTimeout(5000);
            byte[] keyBytes = new byte[16];
            new SecureRandom().nextBytes(keyBytes);
            String key = Base64.getEncoder().encodeToString(keyBytes);
            OutputStream out = s.getOutputStream();
            out.write(("GET /api/v2/ws?token=" + t + " HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    + "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            InputStream in = s.getInputStream();
            String head = readHead(in);
            assertTrue(head, head.startsWith("HTTP/1.1 101"));
            assertTrue(head.contains("Sec-WebSocket-Accept: " + Http.WebSocket.acceptKey(key)));

            sendMasked(out, "{\"t\":\"move\",\"dx\":5,\"dy\":6}");      // no reply for moves
            sendMasked(out, "{\"t\":\"key\",\"k\":\"down\",\"id\":\"7\"}");
            JSONObject ack = new JSONObject(readFrame(in));
            assertEquals("ack", ack.getString("t"));
            assertTrue(ack.getBoolean("ok"));
            assertEquals("7", ack.getString("id"));
            sendMasked(out, "{\"t\":\"key\",\"k\":\"power\"}");
            assertFalse(new JSONObject(readFrame(in)).getBoolean("ok"));
        }
        assertEquals("move:5,6", host.remote.pointer.get(0));
        assertEquals("[down]", host.remote.keys.toString());
    }

    @Test
    public void webSocketNeedsToken() throws Exception {
        try (Socket s = new Socket("127.0.0.1", server.port())) {
            s.setSoTimeout(5000);
            s.getOutputStream().write(("GET /api/v2/ws HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            assertTrue(readHead(s.getInputStream()).startsWith("HTTP/1.1 401"));
        }
    }

    @Test
    public void webSocketAcceptKeyMatchesRfcExample() throws Exception {
        assertEquals("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", Http.WebSocket.acceptKey("dGhlIHNhbXBsZSBub25jZQ=="));
    }

    // ---- tiny WebSocket client ----

    private static String readHead(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c, state = 0;
        while ((c = in.read()) != -1) {
            b.write(c);
            state = (c == '\r' || c == '\n') ? state + 1 : 0;
            if (state == 4) break;
        }
        return b.toString("UTF-8");
    }

    private static void sendMasked(OutputStream out, String text) throws Exception {
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        byte[] mask = {1, 2, 3, 4};
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x81);
        f.write(0x80 | data.length);
        f.write(mask);
        for (int i = 0; i < data.length; i++) f.write(data[i] ^ mask[i & 3]);
        out.write(f.toByteArray());
        out.flush();
    }

    private static String readFrame(InputStream in) throws Exception {
        int b0 = in.read(), b1 = in.read();
        assertEquals(0x81, b0);
        int len = b1 & 0x7f;
        if (len == 126) len = (in.read() << 8) | in.read();
        byte[] d = new byte[len];
        int off = 0;
        while (off < len) off += in.read(d, off, len - off);
        return new String(d, StandardCharsets.UTF_8);
    }
}
