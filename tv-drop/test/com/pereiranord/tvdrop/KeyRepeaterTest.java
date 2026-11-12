package com.pereiranord.tvdrop;

import org.junit.After;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/** Holding a key on the phone = the TV repeats it until released. */
public class KeyRepeaterTest extends ServerTestBase {
    private final ScheduledExecutorService ex = Executors.newSingleThreadScheduledExecutor();

    @After
    public void stopExec() {
        ex.shutdownNow();
    }

    @Test
    public void repeatsSteadilyUntilReleased() throws Exception {
        AtomicInteger n = new AtomicInteger();
        KeyRepeater r = new KeyRepeater(ex, k -> { n.incrementAndGet(); return null; });
        r.start("a", "right");
        assertEquals("one press right away", 1, n.get());
        Thread.sleep(1000);
        r.stop("a", "right");
        int atRelease = n.get();
        // 1 + (1000 - 350) / 110 ≈ 6-7 presses; allow slack for slow machines
        assertTrue("repeats while held: " + atRelease, atRelease >= 4 && atRelease <= 9);
        Thread.sleep(400);
        assertEquals("nothing after release", atRelease, n.get());
        assertEquals(0, r.held());
    }

    @Test
    public void volumeRepeatsSlowerThanArrows() {
        assertTrue(KeyRepeater.interval("volup") > KeyRepeater.interval("right"));
        assertTrue(KeyRepeater.interval("chup") > KeyRepeater.interval("volup"));
    }

    @Test
    public void connectionGoneReleasesEverything() throws Exception {
        AtomicInteger n = new AtomicInteger();
        KeyRepeater r = new KeyRepeater(ex, k -> { n.incrementAndGet(); return null; });
        r.start("ws1", "up");
        r.start("ws1", "volup");
        r.start("ws2", "down");
        r.stopAll("ws1");
        assertEquals(1, r.held());
        r.stopAll("ws2");
        assertEquals(0, r.held());
    }

    @Test
    public void safetyLimitStopsAForgottenHold() throws Exception {
        AtomicInteger n = new AtomicInteger();
        KeyRepeater r = new KeyRepeater(ex, k -> { n.incrementAndGet(); return null; }).maxHold(600);
        r.start("a", "down");
        Thread.sleep(900);
        assertEquals("a lost 'released' must not scroll forever", 0, r.held());
        int c = n.get();
        Thread.sleep(300);
        assertEquals(c, n.get());
    }

    @Test
    public void refusedKeyIsNotHeld() {
        KeyRepeater r = new KeyRepeater(ex, k -> "precisa parear");
        assertNotNull(r.start("a", "power"));
        assertEquals(0, r.held());
    }

    @Test
    public void webSocketHoldAndDisconnect() throws Exception {
        String t = pair();
        try (Socket s = new Socket("127.0.0.1", server.port())) {
            s.setSoTimeout(5000);
            OutputStream out = s.getOutputStream();
            out.write(("GET /api/v2/ws?token=" + t + " HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    + "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            InputStream in = s.getInputStream();
            readHead(in);
            sendMasked(out, "{\"t\":\"hold\",\"k\":\"right\",\"on\":true}");
            Thread.sleep(800);
            sendMasked(out, "{\"t\":\"hold\",\"k\":\"right\",\"on\":false}");
            Thread.sleep(200);
            int held = host.remote.keys.size();
            assertTrue("TV repeated the key while held: " + held, held >= 3);
            Thread.sleep(300);
            assertEquals("stopped on release", held, host.remote.keys.size());
            sendMasked(out, "{\"t\":\"hold\",\"k\":\"down\",\"on\":true}");
            Thread.sleep(500);
        } // socket closed while "down" is held
        Thread.sleep(300);
        int afterClose = host.remote.keys.size();
        Thread.sleep(400);
        assertEquals("closing the connection releases the key", afterClose, host.remote.keys.size());
        assertEquals(0, server.repeater.held());
    }

    @Test
    public void httpHoldRoute() throws Exception {
        String t = pair();
        assertEquals(200, req("POST", "/api/v2/remote/hold", "{\"key\":\"left\",\"on\":true}", t).code);
        Thread.sleep(600);
        assertEquals(200, req("POST", "/api/v2/remote/hold", "{\"key\":\"left\",\"on\":false}", t).code);
        assertTrue(host.remote.keys.size() >= 2);
        assertEquals(409, req("POST", "/api/v2/remote/hold", "{\"key\":\"power\",\"on\":true}", t).code);
        assertEquals(0, server.repeater.held());
    }

    private static void readHead(InputStream in) throws Exception {
        int c, state = 0;
        while ((c = in.read()) != -1) {
            state = (c == '\r' || c == '\n') ? state + 1 : 0;
            if (state == 4) break;
        }
    }

    private static void sendMasked(OutputStream out, String text) throws Exception {
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        byte[] mask = {7, 3, 1, 9};
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x81);
        f.write(0x80 | data.length);
        f.write(mask);
        for (int i = 0; i < data.length; i++) f.write(data[i] ^ mask[i & 3]);
        out.write(f.toByteArray());
        out.flush();
    }
}
