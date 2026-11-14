package com.pereiranord.tvdrop;

import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** Party games: the room relays messages between the TV page (host) and the phones, and nothing else. */
public class GameHubTest extends ServerTestBase {

    /** A tiny WebSocket client. */
    static final class Ws implements AutoCloseable {
        final Socket s;
        final InputStream in;
        final OutputStream out;
        final String head;

        Ws(int port, String path) throws Exception {
            s = new Socket("127.0.0.1", port);
            s.setSoTimeout(5000);
            out = s.getOutputStream();
            in = s.getInputStream();
            out.write(("GET " + path + " HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            int c, state = 0;
            while ((c = in.read()) != -1) {
                b.write(c);
                state = (c == '\r' || c == '\n') ? state + 1 : 0;
                if (state == 4) break;
            }
            head = b.toString("UTF-8");
        }

        void send(String text) throws Exception {
            byte[] data = text.getBytes(StandardCharsets.UTF_8);
            byte[] mask = {1, 2, 3, 4};
            ByteArrayOutputStream f = new ByteArrayOutputStream();
            f.write(0x81);
            if (data.length < 126) f.write(0x80 | data.length);
            else { f.write(0x80 | 126); f.write(data.length >> 8); f.write(data.length & 0xff); }
            f.write(mask);
            for (int i = 0; i < data.length; i++) f.write(data[i] ^ mask[i & 3]);
            out.write(f.toByteArray());
            out.flush();
        }

        /** Next text message, or null when the server closed the connection. */
        String read() throws Exception {
            int b0 = in.read(), b1 = in.read();
            if (b0 < 0 || (b0 & 0x0f) == 0x8) return null;
            int len = b1 & 0x7f;
            if (len == 126) len = (in.read() << 8) | in.read();
            byte[] d = new byte[len];
            int off = 0;
            while (off < len) off += in.read(d, off, len - off);
            return new String(d, StandardCharsets.UTF_8);
        }

        @Override public void close() throws Exception { s.close(); }
    }

    private String open() throws Exception {
        JSONObject r = new JSONObject(req("POST", "/api/v2/games/open", "", pair()).body);
        assertTrue(r.getBoolean("open"));
        assertTrue(host.gamesUrl, host.gamesUrl.startsWith("http://127.0.0.1:" + server.port() + "/gamer-tv.html?key="));
        assertTrue(r.getString("url").endsWith("/jogar"));
        return r.getString("code");
    }

    @Test
    public void openingTheGamesNeedsAPairedDeviceButJoiningOnlyNeedsTheCode() throws Exception {
        assertEquals(401, req("POST", "/api/v2/games/open", "", null).code);
        assertEquals(401, req("GET", "/api/v2/games", (String) null, null).code);
        String code = open();
        assertTrue(code, code.matches("[1-9][0-9]{3}"));
        try (Ws p = new Ws(server.port(), "/api/v2/games/ws?room=" + code.toLowerCase() + "&id=phone000001")) {
            assertTrue(p.head, p.head.startsWith("HTTP/1.1 101"));
            assertFalse("no TV page connected yet", new JSONObject(p.read()).getBoolean("on"));
        }
    }

    @Test
    public void messagesGoBetweenThePhonesAndTheTvPage() throws Exception {
        String code = open();
        String key = server.games.hostKey();
        try (Ws tv = new Ws(server.port(), "/api/v2/games/ws?role=host&key=" + key);
             Ws ana = new Ws(server.port(), "/api/v2/games/ws?room=" + code + "&id=anaphone0001")) {
            JSONObject room = new JSONObject(tv.read());
            assertEquals("room", room.getString("t"));
            assertEquals(code, room.getString("code"));
            // Ana may have arrived before or after the TV page: either way the TV hears about her once
            String first = ana.read();
            assertEquals("host", new JSONObject(first).getString("t"));
            JSONObject join = new JSONObject(tv.read());
            assertEquals("join", join.getString("t"));
            assertEquals("anaphone0001", join.getString("id"));

            ana.send("{\"t\":\"hello\",\"name\":\"Ana\"}");
            JSONObject m = new JSONObject(tv.read());
            assertEquals("m", m.getString("t"));
            assertEquals("anaphone0001", m.getString("id"));
            assertEquals("Ana", m.getJSONObject("d").getString("name"));

            try (Ws bia = new Ws(server.port(), "/api/v2/games/ws?room=" + code + "&id=biaphone0002")) {
                assertTrue(new JSONObject(bia.read()).getBoolean("on"));
                assertEquals("biaphone0002", new JSONObject(tv.read()).getString("id"));
                tv.send("biaphone0002|{\"t\":\"fx\",\"k\":\"dead\"}");
                tv.send("*|{\"t\":\"go\"}");
                assertEquals("dead", new JSONObject(bia.read()).getString("k"));
                assertEquals("go", new JSONObject(bia.read()).getString("t"));
                String forAna = ana.read();
                while (new JSONObject(forAna).getString("t").equals("host")) forAna = ana.read();
                assertEquals("only the broadcast reaches Ana", "go", new JSONObject(forAna).getString("t"));
            }
            JSONObject leave = new JSONObject(tv.read());
            assertEquals("leave", leave.getString("t"));
            assertEquals("biaphone0002", leave.getString("id"));
            assertEquals(1, new JSONObject(req("GET", "/api/v2/games", (String) null, pair()).body).getInt("players"));

            assertEquals(200, req("POST", "/api/v2/games/close", "", pair()).code);
            String last = ana.read();
            assertEquals("closed", new JSONObject(last).getString("t"));
            assertNull(host.gamesUrl);
        }
        assertFalse(server.games.isOpen());
    }

    @Test
    public void wrongCodeWrongKeyAndBadIdsAreRefused() throws Exception {
        String code = open();
        String other = code.equals("1111") ? "2222" : "1111";
        try (Ws p = new Ws(server.port(), "/api/v2/games/ws?room=" + other + "&id=phone000001")) {
            assertEquals("noroom", new JSONObject(p.read()).getString("t"));
            assertNull(p.read());
        }
        try (Ws h = new Ws(server.port(), "/api/v2/games/ws?role=host&key=nope")) {
            assertTrue(h.head, h.head.startsWith("HTTP/1.1 403"));
        }
        try (Ws p = new Ws(server.port(), "/api/v2/games/ws?room=" + code + "&id=../x")) {
            assertTrue(p.head, p.head.startsWith("HTTP/1.1 400"));
        }
        assertEquals(403, req("GET", "/api/v2/games/qr?key=nope", (String) null, null).code);
    }

    @Test
    public void theHostCanRemoveAPlayer() throws Exception {
        String code = open();
        try (Ws tv = new Ws(server.port(), "/api/v2/games/ws?role=host&key=" + server.games.hostKey());
             Ws bob = new Ws(server.port(), "/api/v2/games/ws?room=" + code + "&id=bobphone0001")) {
            assertEquals("room", new JSONObject(tv.read()).getString("t"));
            assertEquals("host", new JSONObject(bob.read()).getString("t"));
            assertEquals("join", new JSONObject(tv.read()).getString("t"));
            tv.send("!kick|bobphone0001");
            assertEquals("kicked", new JSONObject(bob.read()).getString("t"));
            assertNull("the removed phone is disconnected", bob.read());
            JSONObject leave = new JSONObject(tv.read());
            assertEquals("leave", leave.getString("t"));
            assertTrue(leave.getBoolean("kicked"));
            assertEquals(0, server.games.playerCount());
        }
    }

    @Test
    public void phonesGetAPongAndCannotFloodTheTv() throws Exception {
        String code = open();
        try (Ws tv = new Ws(server.port(), "/api/v2/games/ws?role=host&key=" + server.games.hostKey());
             Ws p = new Ws(server.port(), "/api/v2/games/ws?room=" + code + "&id=floodphone01")) {
            assertEquals("room", new JSONObject(tv.read()).getString("t"));
            assertEquals("host", new JSONObject(p.read()).getString("t"));
            assertEquals("join", new JSONObject(tv.read()).getString("t"));
            p.send("{\"t\":\"p\"}");
            assertEquals("pong", new JSONObject(p.read()).getString("t"));
            // 2000 messages at once. The limit refills with time, so what may pass depends on how long this machine takes:
            // a burst of BURST plus RATE per second, never more.
            final int sent = 2000;
            long t0 = System.nanoTime();
            for (int i = 0; i < sent; i++) p.send("{\"t\":\"g\",\"k\":\"in\",\"n\":" + i + "}");
            p.send("{\"t\":\"p\"}");
            assertEquals("pong", new JSONObject(p.read()).getString("t")); // the phone's messages are all read by now
            double secs = (System.nanoTime() - t0) / 1e9;
            long allowed = (long) Math.ceil(GameHub.BURST + GameHub.RATE * secs) + 2;
            assertTrue("no more than the limit passes (" + allowed + " in " + secs + " s): refused " + server.games.dropped, server.games.dropped >= sent - allowed);
            assertTrue("and the burst itself passes: refused " + server.games.dropped, server.games.dropped <= sent - GameHub.BURST + 1);
            int got = 0;
            tv.s.setSoTimeout(800);
            try { while (tv.read() != null) got++; } catch (java.net.SocketTimeoutException e) { /* drained */ }
            assertTrue("the TV page received only the allowed part: " + got, got >= GameHub.BURST - 1 && got <= allowed);
        }
    }

    @Test
    public void aRoomCodeGivesNoAccessToTheRestOfTheTv() throws Exception {
        String code = open();
        assertEquals(401, req("GET", "/api/status?room=" + code, (String) null, null).code);
        assertEquals(401, req("POST", "/api/v2/remote/key", "{\"key\":\"home\"}", null).code);
        assertNotNull(code);
    }

    @Test
    public void theControllerPageIsServedWithoutPairingAndMayBeEmbedded() throws Exception {
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(base + "/jogar?sala=ABCD").openConnection();
        assertEquals(200, c.getResponseCode());
        assertNull(c.getHeaderField("Content-Security-Policy"));
        java.net.HttpURLConnection i = (java.net.HttpURLConnection) new java.net.URL(base + "/").openConnection();
        assertEquals(200, i.getResponseCode());
        assertNotNull(i.getHeaderField("Content-Security-Policy"));
    }
}
