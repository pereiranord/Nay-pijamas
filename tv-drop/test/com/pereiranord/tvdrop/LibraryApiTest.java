package com.pereiranord.tvdrop;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Queue, playlists, history, player tracks and timer through the HTTP API. */
public class LibraryApiTest extends ServerTestBase {

    @Test
    public void queueFlow() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=a.mp4", "x", t);
        assertEquals(200, req("POST", "/api/v2/queue/add", "{\"src\":\"inbox:a.mp4\"}", t).code);
        assertEquals(200, req("POST", "/api/v2/queue/add", "{\"src\":\"https://h/b.mp4\",\"title\":\"Filme B\"}", t).code);
        assertEquals(400, req("POST", "/api/v2/queue/add", "{\"src\":\"file:///etc/passwd\"}", t).code);
        // a path in an inbox name is cut down to the plain file name: it can never leave the inbox
        assertEquals(200, req("POST", "/api/v2/queue/add", "{\"src\":\"inbox:../../x.mp4\"}", t).code);
        JSONObject q = new JSONObject(req("GET", "/api/v2/queue", (String) null, t).body);
        assertEquals(3, q.getJSONArray("items").length());
        assertEquals("inbox:x.mp4", q.getJSONArray("items").getJSONObject(2).getString("src"));
        assertEquals(200, req("POST", "/api/v2/queue/remove", "{\"index\":2}", t).code);

        Res play = req("POST", "/api/v2/queue/play", "{\"index\":0}", t);
        assertEquals(200, play.code);
        assertTrue(host.played.get(host.played.size() - 1).endsWith("a.mp4"));
        assertEquals(200, req("POST", "/api/v2/queue/next", "", t).code);
        assertEquals("https://h/b.mp4", host.played.get(host.played.size() - 1));
        assertEquals("Filme B", new JSONObject(req("GET", "/api/v2/queue", (String) null, t).body)
                .getJSONArray("items").getJSONObject(1).getString("title"));
        assertEquals(200, req("POST", "/api/v2/queue/move", "{\"from\":1,\"to\":0}", t).code);
        assertEquals(404, req("POST", "/api/v2/queue/remove", "{\"index\":99}", t).code);
        assertEquals(200, req("POST", "/api/v2/queue/repeat", "{\"mode\":\"all\"}", t).code);
        assertEquals(400, req("POST", "/api/v2/queue/repeat", "{\"mode\":\"sometimes\"}", t).code);
    }

    @Test
    public void legacyPlayStopsQueueAutoAdvance() throws Exception {
        String t = pair();
        req("POST", "/api/v2/queue/add", "{\"src\":\"https://h/a.mp4\"}", t);
        req("POST", "/api/v2/queue/add", "{\"src\":\"https://h/b.mp4\"}", t);
        req("POST", "/api/v2/queue/play", "{\"index\":0}", t);
        assertTrue(server.library.queueActive());
        req("POST", "/api/play", "https://other/video.mp4", t);
        assertFalse("a link played on its own must not continue into the queue", server.library.queueActive());
    }

    @Test
    public void addNowPlaysImmediately() throws Exception {
        String t = pair();
        Res r = req("POST", "/api/v2/queue/add", "{\"src\":\"https://h/now.mp4\",\"mode\":\"now\"}", t);
        assertEquals(200, r.code);
        assertEquals("https://h/now.mp4", host.played.get(0));
    }

    @Test
    public void playlists() throws Exception {
        String t = pair();
        assertEquals(400, req("POST", "/api/v2/playlists/save", "{\"name\":\"Vazia\"}", t).code);
        req("POST", "/api/v2/queue/add", "{\"src\":\"https://h/a.mp4\"}", t);
        assertEquals(200, req("POST", "/api/v2/playlists/save", "{\"name\":\"Sábado\"}", t).code);
        req("POST", "/api/v2/queue/clear", "", t);
        assertEquals(200, req("POST", "/api/v2/playlists/load", "{\"name\":\"Sábado\",\"play\":true}", t).code);
        assertEquals("https://h/a.mp4", host.played.get(0));
        assertEquals(1, new JSONObject(req("GET", "/api/v2/playlists", (String) null, t).body).getJSONArray("playlists").length());
        assertEquals(200, req("POST", "/api/v2/playlists/delete", "{\"name\":\"Sábado\"}", t).code);
        assertEquals(404, req("POST", "/api/v2/playlists/load", "{\"name\":\"Sábado\"}", t).code);
    }

    @Test
    public void historyResumeAndPrivacy() throws Exception {
        String t = pair();
        server.library.recordStart("https://h/f.mp4", "Filme");
        server.library.recordProgress("https://h/f.mp4", 600_000, 6_000_000);
        JSONObject h = new JSONObject(req("GET", "/api/v2/history", (String) null, t).body);
        assertEquals(600_000, h.getJSONArray("items").getJSONObject(0).getLong("resume"));
        assertEquals(200, req("POST", "/api/v2/history/play", "{\"src\":\"https://h/f.mp4\",\"resume\":true}", t).code);
        assertEquals("https://h/f.mp4@600000", host.played.get(0));
        assertEquals(200, req("POST", "/api/v2/history/favorite", "{\"src\":\"https://h/f.mp4\"}", t).code);
        assertEquals(200, req("POST", "/api/v2/history/enabled", "{\"enabled\":false}", t).code);
        assertEquals(0, new JSONObject(req("GET", "/api/v2/history", (String) null, t).body).getJSONArray("items").length());
    }

    @Test
    public void historyPlayOfDeletedFile() throws Exception {
        String t = pair();
        assertEquals(404, req("POST", "/api/v2/history/play", "{\"src\":\"inbox:gone.mp4\"}", t).code);
    }

    @Test
    public void playerTracksAndSpeed() throws Exception {
        String t = pair();
        assertEquals(409, req("GET", "/api/v2/player/tracks", (String) null, t).code);
        host.play("https://h/v.mkv");
        JSONObject tr = new JSONObject(req("GET", "/api/v2/player/tracks", (String) null, t).body);
        assertEquals("DTS 5.1", tr.getJSONArray("audio").getJSONObject(0).getString("label"));
        assertEquals(200, req("POST", "/api/v2/player/track", "{\"type\":\"text\",\"group\":1,\"track\":0}", t).code);
        assertEquals("text:1:0", host.selected);
        assertEquals(200, req("POST", "/api/v2/player/speed", "{\"speed\":1.5}", t).code);
        assertEquals(1.5f, host.speed, 0.001);
        assertEquals(400, req("POST", "/api/v2/player/speed", "{\"speed\":9}", t).code);
    }

    @Test
    public void timerApiAndActions() throws Exception {
        String t = pair();
        Res set = req("POST", "/api/v2/timer", "{\"minutes\":30,\"action\":\"pause\"}", t);
        assertEquals(200, set.code);
        assertTrue(new JSONObject(req("GET", "/api/v2/timer", (String) null, t).body).getBoolean("active"));
        assertEquals(400, req("POST", "/api/v2/timer", "{\"minutes\":0}", t).code);
        assertEquals(200, req("POST", "/api/v2/timer/cancel", "", t).code);
        assertFalse(new JSONObject(req("GET", "/api/v2/timer", (String) null, t).body).getBoolean("active"));

        // actions as they run when the timer fires
        host.play("https://h/v.mp4");
        ApiV2.timerAction(host, "pause");
        assertEquals("pause", host.controls.get(host.controls.size() - 1));
        ApiV2.timerAction(host, "mute");
        assertEquals("mute", host.volume.get(host.volume.size() - 1));
        ApiV2.timerAction(host, "power"); // FakeRemote refuses power -> falls back to stopping playback
        assertEquals("stop", host.controls.get(host.controls.size() - 1));
    }
}
