package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Batch B: thumbnails, durations, other apps' media, screenshot, slideshow, PDF, subtitles, space. */
public class MediaApiTest extends ServerTestBase {

    @Test
    public void thumbnailsAndDurationsOfReceivedFiles() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=filme.mp4", new byte[1000], t);
        req("POST", "/api/upload?name=doc.txt", new byte[10], t);
        Res img = req("GET", "/api/v2/thumb?src=inbox:filme.mp4&token=" + t, (String) null, null);
        assertEquals(200, img.code);
        assertEquals((byte) 0xFF, img.bytes[0]);
        assertEquals(404, req("GET", "/api/v2/thumb?src=inbox:doc.txt", (String) null, t).code);
        assertEquals(400, req("GET", "/api/v2/thumb?src=inbox:../x", (String) null, t).code);
        assertEquals(125_000, new JSONObject(req("GET", "/api/v2/media/info?src=inbox:filme.mp4", (String) null, t).body).getLong("duration"));
        assertEquals(-1, new JSONObject(req("GET", "/api/v2/media/info?src=inbox:doc.txt", (String) null, t).body).getLong("duration"));
    }

    @Test
    public void otherAppsMediaAndControl() throws Exception {
        String t = pair();
        JSONObject now = new JSONObject(req("GET", "/api/v2/media/now", (String) null, t).body);
        assertTrue(now.getBoolean("available"));
        assertEquals("Série X", now.getString("title"));
        assertEquals(200, req("GET", "/api/v2/media/art", (String) null, t).code);
        assertEquals(200, req("POST", "/api/v2/media/control", "{\"action\":\"toggle\"}", t).code);
        assertEquals(200, req("POST", "/api/v2/media/control", "{\"action\":\"seek\",\"ms\":90000}", t).code);
        assertEquals(400, req("POST", "/api/v2/media/control", "{\"action\":\"rm\"}", t).code);
        assertEquals("[ext:toggle, ext:seek:90000]", host.media.toString());
    }

    @Test
    public void screenshotIsAJpeg() throws Exception {
        String t = pair();
        Res r = req("GET", "/api/v2/screenshot?token=" + t, (String) null, null);
        assertEquals(200, r.code);
        assertEquals((byte) 0xD8, r.bytes[1]);
        assertEquals(401, req("GET", "/api/v2/screenshot", (String) null, null).code);
    }

    @Test
    public void slideshowOnlyUsesReceivedImages() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=a.jpg", new byte[10], t);
        req("POST", "/api/upload?name=b.png", new byte[10], t);
        req("POST", "/api/upload?name=m.mp3", new byte[10], t);
        req("POST", "/api/upload?name=v.mp4", new byte[10], t);
        assertEquals(200, req("POST", "/api/v2/slideshow",
                "{\"files\":[\"a.jpg\",\"b.png\",\"v.mp4\",\"../x.jpg\"],\"seconds\":1,\"music\":\"m.mp3\"}", t).code);
        assertEquals("slides:2:2:true", host.media.get(0));
        assertEquals(400, req("POST", "/api/v2/slideshow", "{\"files\":[\"v.mp4\"]}", t).code);
        assertEquals(200, req("POST", "/api/v2/slideshow/stop", "", t).code);
    }

    @Test
    public void pdfPresentation() throws Exception {
        String t = pair();
        assertFalse(new JSONObject(req("GET", "/api/v2/present", (String) null, t).body).getBoolean("active"));
        req("POST", "/api/upload?name=slides.pdf", new byte[10], t);
        req("POST", "/api/upload?name=foto.jpg", new byte[10], t);
        assertEquals(400, req("POST", "/api/v2/present", "{\"file\":\"foto.jpg\"}", t).code);
        JSONObject st = new JSONObject(req("POST", "/api/v2/present", "{\"file\":\"slides.pdf\"}", t).body);
        assertEquals(10, st.getInt("pages"));
        assertEquals(1, new JSONObject(req("POST", "/api/v2/present/control", "{\"action\":\"next\"}", t).body).getInt("page"));
        assertEquals(7, new JSONObject(req("POST", "/api/v2/present/control", "{\"action\":\"goto\",\"page\":7}", t).body).getInt("page"));
        assertEquals(200, req("GET", "/api/v2/present/page?page=7&token=" + t, (String) null, null).code);
        assertFalse(new JSONObject(req("POST", "/api/v2/present/control", "{\"action\":\"stop\"}", t).body).getBoolean("active"));
        assertEquals(409, req("POST", "/api/v2/present/control", "{\"action\":\"next\"}", t).code);
    }

    @Test
    public void subtitleForWhatIsPlaying() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=filme.srt", "1\n00:00:01,000 --> 00:00:02,000\nOi\n".getBytes(StandardCharsets.UTF_8), t);
        assertEquals(409, req("POST", "/api/v2/player/subtitle", "{\"file\":\"filme.srt\"}", t).code);
        host.playing = "/x/filme.mkv";
        assertEquals(200, req("POST", "/api/v2/player/subtitle", "{\"file\":\"filme.srt\"}", t).code);
        assertEquals(400, req("POST", "/api/v2/player/subtitle", "{\"file\":\"nada.srt\"}", t).code);
        assertEquals("[sub:filme.srt]", host.media.toString());
        assertEquals("subtitle", HttpServer.kind("x.vtt"));
    }

    @Test
    public void openSubtitlesSearchAndDownloadAgainstAFakeServer() throws Exception {
        List<String> keys = new ArrayList<>();
        java.net.ServerSocket ss = new java.net.ServerSocket(0, 10, java.net.InetAddress.getByName("127.0.0.1"));
        String fbase = "http://127.0.0.1:" + ss.getLocalPort();
        Thread fake = new Thread(() -> {
            while (!ss.isClosed()) {
                try (java.net.Socket so = ss.accept()) {
                    java.io.BufferedReader in = new java.io.BufferedReader(new java.io.InputStreamReader(so.getInputStream(), StandardCharsets.UTF_8));
                    String path = in.readLine().split(" ")[1];
                    String line;
                    int len = 0;
                    while ((line = in.readLine()) != null && !line.isEmpty()) {
                        String l = line.toLowerCase(java.util.Locale.ROOT);
                        if (l.startsWith("api-key:")) keys.add(line.substring(8).trim());
                        if (l.startsWith("content-length:")) len = Integer.parseInt(line.substring(15).trim());
                    }
                    for (int i = 0; i < len; i++) in.read();
                    String body = path.startsWith("/api/v1/subtitles")
                            ? "{\"data\":[{\"attributes\":{\"release\":\"Filme.2024.1080p\",\"language\":\"pt-BR\",\"download_count\":900,"
                              + "\"feature_details\":{\"title\":\"Filme\",\"year\":2024},\"files\":[{\"file_id\":42,\"file_name\":\"Filme.srt\"}]}}]}"
                            : path.startsWith("/api/v1/download") ? "{\"link\":\"" + fbase + "/file.srt\"}"
                            : "1\n00:00:01,000 --> 00:00:02,000\nOlá\n";
                    byte[] bb = body.getBytes(StandardCharsets.UTF_8);
                    OutputStream o = so.getOutputStream();
                    o.write(("HTTP/1.1 200 OK\r\nContent-Length: " + bb.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    o.write(bb);
                    o.flush();
                } catch (Exception ignored) {
                }
            }
        });
        fake.setDaemon(true);
        fake.start();
        try {
            server.v2.subtitlesBase = fbase + "/api/v1";
            String t = pair();
            assertEquals(409, req("POST", "/api/v2/subtitles/search", "{\"query\":\"Filme\"}", t).code);
            JSONArray res = new JSONObject(req("POST", "/api/v2/subtitles/search", "{\"query\":\"Filme\",\"key\":\"K1\"}", t).body).getJSONArray("results");
            assertEquals(42, res.getJSONObject(0).getLong("fileId"));
            assertEquals("Filme", res.getJSONObject(0).getString("title"));
            assertEquals("K1", keys.get(0));
            JSONObject d = new JSONObject(req("POST", "/api/v2/subtitles/download", "{\"fileId\":42,\"key\":\"K1\",\"name\":\"Filme\"}", t).body);
            assertEquals("Filme.srt", d.getString("file"));
            assertFalse("nothing playing, so not attached", d.getBoolean("attached"));
            assertTrue(new java.io.File(host.inbox(), "Filme.srt").length() > 10);
        } finally {
            ss.close();
        }
    }

    @Test
    public void lowSpaceWarningAndUploadRefusal() throws Exception {
        String t = pair();
        assertFalse(new JSONObject(req("GET", "/api/v2/capabilities", (String) null, t).body).getJSONObject("storage").getBoolean("low"));
        host.free = 300L << 20; // 300 MB
        assertTrue(new JSONObject(req("GET", "/api/v2/capabilities", (String) null, t).body).getJSONObject("storage").getBoolean("low"));
        host.free = 150L << 20;
        Res r = req("POST", "/api/upload?name=grande.mp4", new byte[60 << 20], t);
        assertEquals(507, r.code);
        assertTrue(r.body.contains("no_space"));
        assertEquals(200, req("POST", "/api/upload?name=pequeno.mp4", new byte[1000], t).code);
    }

    @Test
    public void queueShuffleKeepsTheCurrentItem() throws Exception {
        Library lib = new Library(new KeyValueStore.Memory());
        for (int i = 0; i < 10; i++) lib.add(new Library.Item("https://x/" + i + ".mp4", "v" + i), "end");
        lib.play(2);
        List<String> before = srcs(lib);
        lib.shuffle(new Random(3));
        List<String> after = srcs(lib);
        assertEquals(before.subList(0, 3), after.subList(0, 3));
        assertTrue(!before.equals(after));
        java.util.Collections.sort(before);
        java.util.Collections.sort(after);
        assertEquals(before, after);
    }

    private static List<String> srcs(Library lib) {
        List<String> out = new ArrayList<>();
        for (Library.Item i : lib.queue()) out.add(i.src);
        return out;
    }
}
