package com.pereiranord.tvdrop;

import org.junit.Test;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** The web pages and their files: sub-folders, fonts, and byte ranges for the trailers. */
public class WebAssetTest extends ServerTestBase {

    private HttpURLConnection get(String path, String range) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        if (range != null) c.setRequestProperty("Range", range);
        return c;
    }

    private static byte[] body(HttpURLConnection c) throws Exception {
        try (InputStream in = c.getResponseCode() >= 400 ? c.getErrorStream() : c.getInputStream()) {
            return in == null ? new byte[0] : in.readAllBytes();
        }
    }

    @Test
    public void filesInSubFoldersAreServedWithTheirType() throws Exception {
        host.assets.put("gamer/tokens.css", ":root{}".getBytes(StandardCharsets.UTF_8));
        host.assets.put("gamer/fonts/Archivo.woff2", new byte[]{1, 2, 3});
        HttpURLConnection css = get("/gamer/tokens.css", null);
        assertEquals(200, css.getResponseCode());
        assertTrue(css.getContentType().startsWith("text/css"));
        assertEquals("no-store", css.getHeaderField("Cache-Control"));
        HttpURLConnection font = get("/gamer/fonts/Archivo.woff2", null);
        assertEquals(200, font.getResponseCode());
        assertEquals("font/woff2", font.getContentType());
        assertEquals("max-age=3600", font.getHeaderField("Cache-Control"));
    }

    @Test
    public void namesThatLeaveTheWebFolderAreRefused() throws Exception {
        assertFalse(HttpServer.isAssetName("../secret.txt"));
        assertFalse(HttpServer.isAssetName("gamer/../../x.js"));
        assertFalse(HttpServer.isAssetName("/etc/passwd"));
        assertFalse(HttpServer.isAssetName("a/b/c/d/e.js"));
        assertTrue(HttpServer.isAssetName("media/trailers/rabisco.mp4"));
        assertEquals(404, get("/gamer/..%2F..%2Fx.js", null).getResponseCode());
    }

    @Test
    public void trailersAnswerByteRanges() throws Exception {
        byte[] video = new byte[1000];
        for (int i = 0; i < video.length; i++) video[i] = (byte) i;
        host.assets.put("media/trailers/x.mp4", video);
        HttpURLConnection all = get("/media/trailers/x.mp4", null);
        assertEquals(200, all.getResponseCode());
        assertEquals("video/mp4", all.getContentType());
        assertEquals("bytes", all.getHeaderField("Accept-Ranges"));
        assertEquals(1000, body(all).length);

        HttpURLConnection part = get("/media/trailers/x.mp4", "bytes=100-199");
        assertEquals(206, part.getResponseCode());
        assertEquals("bytes 100-199/1000", part.getHeaderField("Content-Range"));
        byte[] expected = new byte[100];
        System.arraycopy(video, 100, expected, 0, 100);
        assertArrayEquals(expected, body(part));

        HttpURLConnection tail = get("/media/trailers/x.mp4", "bytes=900-");
        assertEquals(206, tail.getResponseCode());
        assertEquals(100, body(tail).length);
        assertEquals(416, get("/media/trailers/x.mp4", "bytes=5000-").getResponseCode());
        assertNull(Http.parseRange("bytes=1-2,5-6", 1000));
    }

    @Test
    public void theGamesPageIsTheNewCentral() throws Exception {
        String t = pair();
        req("POST", "/api/v2/games/open", "", t);
        assertTrue(host.gamesUrl, host.gamesUrl.contains("/gamer-tv.html?key="));
    }
}
