package com.pereiranord.tvdrop;

import org.junit.Test;

import java.net.HttpURLConnection;
import java.net.URL;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** The standalone index.html (opened outside the TV) calls the TV cross-origin. */
public class CorsTest extends ServerTestBase {

    private HttpURLConnection open(String method, String path, String origin, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setRequestMethod(method);
        if (origin != null) c.setRequestProperty("Origin", origin);
        if (token != null) c.setRequestProperty("X-TVDrop-Token", token);
        return c;
    }

    @Test
    public void preflightIsAnswered() throws Exception {
        HttpURLConnection c = open("OPTIONS", "/api/v2/remote/key", "null", null);
        c.setRequestProperty("Access-Control-Request-Method", "POST");
        c.setRequestProperty("Access-Control-Request-Headers", "x-tvdrop-token,content-type");
        assertEquals(204, c.getResponseCode());
        assertEquals("*", c.getHeaderField("Access-Control-Allow-Origin"));
        assertTrue(c.getHeaderField("Access-Control-Allow-Headers").contains("X-TVDrop-Token"));
        assertEquals("true", c.getHeaderField("Access-Control-Allow-Private-Network"));
    }

    @Test
    public void responsesCarryCorsHeadersButStillNeedTheToken() throws Exception {
        HttpURLConnection c = open("GET", "/api/v2/capabilities", "http://example.com", null);
        assertEquals(401, c.getResponseCode());
        assertEquals("*", c.getHeaderField("Access-Control-Allow-Origin"));
        String t = pair();
        HttpURLConnection ok = open("GET", "/api/v2/capabilities", "http://example.com", t);
        assertEquals(200, ok.getResponseCode());
    }

    /** Raw request: HttpURLConnection silently drops the Origin header, browsers don't. */
    private int raw(String method, String path, String origin) throws Exception {
        try (java.net.Socket sock = new java.net.Socket("127.0.0.1", server.port())) {
            sock.setSoTimeout(5000);
            String req = method + " " + path + " HTTP/1.1\r\nHost: 127.0.0.1:" + server.port() + "\r\n"
                    + (origin != null ? "Origin: " + origin + "\r\n" : "") + "Content-Length: 0\r\nConnection: close\r\n\r\n";
            sock.getOutputStream().write(req.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            String status = new java.io.BufferedReader(new java.io.InputStreamReader(sock.getInputStream())).readLine();
            return Integer.parseInt(status.split(" ")[1]);
        }
    }

    @Test
    public void legacyOpenNeverAppliesToOtherWebsites() throws Exception {
        pairing.setLegacyOpen(true);
        assertEquals("the 1.0 phone app (no Origin) still works", 200, raw("GET", "/api/status", null));
        assertEquals("a page served by the TV itself too", 200, raw("GET", "/api/status", "http://127.0.0.1:" + server.port()));
        assertEquals("another website can't use the open legacy routes", 401, raw("GET", "/api/status", "http://evil.example"));
        assertEquals(401, raw("POST", "/api/control?cmd=volup", "http://evil.example"));
        assertEquals(401, raw("POST", "/api/control?cmd=volup", "null")); // file:// pages send "null"
        assertTrue(host.volume.isEmpty());
    }
}
