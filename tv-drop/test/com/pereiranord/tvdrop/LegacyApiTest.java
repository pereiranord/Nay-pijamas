package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Random;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Regression tests: the TV Drop 1.0 routes must keep working exactly as the
 * 1.0 phone app and web page use them (with a token, or with legacyOpen on).
 */
public class LegacyApiTest extends ServerTestBase {

    @Test
    public void helloIsOpenAndUnchanged() throws Exception {
        Res r = req("GET", "/api/hello", (String) null, null);
        assertEquals(200, r.code);
        JSONObject o = new JSONObject(r.body);
        assertEquals("tvdrop", o.getString("app"));            // Discovery checks this exact field
        assertEquals("TV Drop (Test TV)", o.getString("name"));
        String expected = Codes.encode("192.168.18.31", server.port()); // null outside 8080-8095
        if (expected == null) assertTrue(o.isNull("code"));
        else assertEquals(expected, o.getString("code"));
    }

    @Test
    public void legacyRoutesNeedPairingByDefault() throws Exception {
        for (String p : new String[]{"/api/status"}) assertEquals(401, req("GET", p, (String) null, null).code);
        for (String p : new String[]{"/api/upload?name=a.mp4", "/api/play", "/api/install?file=a", "/api/delete?file=a", "/api/control?cmd=volup"}) {
            assertEquals(p, 401, req("POST", p, "x", null).code);
        }
        assertTrue(host.volume.isEmpty());
        assertEquals(0, host.inbox.listFiles().length);
    }

    @Test
    public void legacyOpenLetsOldAppsIn() throws Exception {
        pairing.setLegacyOpen(true);
        assertEquals(200, req("GET", "/api/status", (String) null, null).code);
        assertEquals(200, req("POST", "/api/control?cmd=volup", "", null).code);
        assertEquals("up", host.volume.get(0));
        // ...but never the new v2 routes
        assertEquals(401, req("GET", "/api/v2/capabilities", (String) null, null).code);
    }

    @Test
    public void statusHasEveryOriginalField() throws Exception {
        String t = pair();
        JSONObject s = new JSONObject(req("GET", "/api/status", (String) null, t).body);
        for (String k : new String[]{"ip", "port", "canInstall", "canOverlay", "name", "code", "playing",
                "position", "duration", "paused", "audio", "externalPlayer", "files", "log"}) {
            assertTrue("missing " + k, s.has(k));
        }
        assertEquals(server.port(), s.getInt("port"));
    }

    @Test
    public void uploadKeepsBytesAndHandlesDuplicates() throws Exception {
        String t = pair();
        byte[] data = new byte[3_000_000];
        new Random(1).nextBytes(data);
        Res r = req("POST", "/api/upload?name=Meu%20Filme.mp4", data, t);
        assertEquals(200, r.code);
        assertEquals("Meu Filme.mp4", new JSONObject(r.body).getString("name"));
        assertArrayEquals(data, Files.readAllBytes(new File(host.inbox, "Meu Filme.mp4").toPath()));

        Res again = req("POST", "/api/upload?name=Meu%20Filme.mp4", "x", t);
        assertEquals("Meu Filme (2).mp4", new JSONObject(again.body).getString("name"));
        Res replaced = req("POST", "/api/upload?name=Meu%20Filme.mp4&replace=1", "y", t);
        assertEquals("Meu Filme.mp4", new JSONObject(replaced.body).getString("name"));
        assertEquals("y", new String(Files.readAllBytes(new File(host.inbox, "Meu Filme.mp4").toPath()), StandardCharsets.UTF_8));
    }

    @Test
    public void uploadAutoPlaysVideosAndInstallsApks() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=v.mkv&auto=1", "video", t);
        req("POST", "/api/upload?name=app.apk&auto=1", "PK", t);
        req("POST", "/api/upload?name=doc.pdf&auto=1", "%PDF", t);
        assertEquals(1, host.played.size());
        assertTrue(host.played.get(0).endsWith("v.mkv"));
        assertEquals("app.apk", host.installed.get(0));
        assertEquals(1, host.installed.size());
    }

    @Test
    public void uploadCannotEscapeTheInbox() throws Exception {
        String t = pair();
        Res r = req("POST", "/api/upload?name=..%2F..%2Fetc%2Fevil.txt", "x", t);
        assertEquals("evil.txt", new JSONObject(r.body).getString("name"));
        assertTrue(new File(host.inbox, "evil.txt").isFile());
        assertEquals(400, req("POST", "/api/upload?name=...", "x", t).code);
    }

    @Test
    public void playAcceptsLinksAndReceivedFiles() throws Exception {
        String t = pair();
        assertEquals(200, req("POST", "/api/play", "https://example.com/v.m3u8", t).code);
        assertEquals(400, req("POST", "/api/play", "javascript:alert(1)", t).code);
        assertEquals(400, req("POST", "/api/play?file=missing.mp4", "", t).code);
        req("POST", "/api/upload?name=a.mp4", "x", t);
        assertEquals(200, req("POST", "/api/play?file=a.mp4", "", t).code);
        assertEquals("https://example.com/v.m3u8", host.played.get(0));
        assertTrue(host.played.get(1).endsWith("a.mp4"));
    }

    @Test
    public void installAndDelete() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=app.apk", "PK", t);
        req("POST", "/api/upload?name=a.mp4", "x", t);
        assertEquals(200, req("POST", "/api/install?file=app.apk", "", t).code);
        assertEquals(400, req("POST", "/api/install?file=a.mp4", "", t).code);
        assertEquals(200, req("POST", "/api/delete?file=a.mp4", "", t).code);
        assertFalse(new File(host.inbox, "a.mp4").exists());
        assertEquals(400, req("POST", "/api/delete?file=a.mp4", "", t).code);
    }

    @Test
    public void controlRoutesToPlayerAndVolume() throws Exception {
        String t = pair();
        assertEquals(400, req("POST", "/api/control?cmd=toggle", "", t).code); // nothing playing
        host.play("https://example.com/v.mp4");
        assertEquals(200, req("POST", "/api/control?cmd=toggle", "", t).code);
        assertEquals(200, req("POST", "/api/control?cmd=seek&ms=754000", "", t).code);
        req("POST", "/api/control?cmd=voldown", "", t);
        req("POST", "/api/control?cmd=mute", "", t);
        assertEquals("toggle", host.controls.get(0));
        assertEquals("seek:754000", host.controls.get(1));
        assertEquals("down", host.volume.get(0));
        assertEquals("mute", host.volume.get(1));
    }

    @Test
    public void statusListsFilesWithKinds() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=a.mp4", "x", t);
        req("POST", "/api/upload?name=b.apk", "x", t);
        req("POST", "/api/upload?name=c.jpg", "x", t);
        req("POST", "/api/upload?name=d.mp3", "x", t);
        JSONArray files = new JSONObject(req("GET", "/api/status", (String) null, t).body).getJSONArray("files");
        assertEquals(4, files.length());
        StringBuilder kinds = new StringBuilder();
        for (int i = 0; i < files.length(); i++) kinds.append(files.getJSONObject(i).getString("name")).append('=')
                .append(files.getJSONObject(i).getString("kind")).append(' ');
        String k = kinds.toString();
        assertTrue(k, k.contains("a.mp4=video") && k.contains("b.apk=apk") && k.contains("c.jpg=image") && k.contains("d.mp3=audio"));
    }

    @Test
    public void webPagesAreServedWithoutToken() throws Exception {
        Res r = req("GET", "/", (String) null, null);
        assertEquals(200, r.code);
        assertTrue(r.body.contains("TV Drop"));
        assertEquals(200, req("GET", "/app.js", (String) null, null).code);
        assertEquals(404, req("GET", "/missing.js", (String) null, null).code);
        assertEquals(404, req("GET", "/..%2F..%2Fsecret", (String) null, null).code);
    }
}
