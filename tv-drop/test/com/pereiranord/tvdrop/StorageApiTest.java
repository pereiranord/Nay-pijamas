package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.File;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class StorageApiTest extends ServerTestBase {

    @Test
    public void analysisGroupsReceivedFilesAndListsTheLargest() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=filme.mkv", new byte[300_000], t);
        req("POST", "/api/upload?name=musica.mp3", new byte[50_000], t);
        req("POST", "/api/upload?name=foto.jpg", new byte[20_000], t);
        req("POST", "/api/upload?name=app.apk", new byte[100_000], t);
        JSONObject s = new JSONObject(req("GET", "/api/v2/storage", (String) null, t).body);
        assertEquals(2, s.getJSONArray("volumes").length());
        JSONObject inbox = s.getJSONObject("inbox");
        assertEquals(4, inbox.getInt("count"));
        assertEquals(470_000, inbox.getLong("bytes"));
        assertEquals(300_000, inbox.getJSONObject("byKind").getJSONObject("video").getLong("bytes"));
        assertEquals(1, inbox.getJSONObject("byKind").getJSONObject("audio").getInt("count"));
        JSONArray largest = inbox.getJSONArray("largest");
        assertEquals("filme.mkv", largest.getJSONObject(0).getString("name"));
        assertEquals("foto.jpg", largest.getJSONObject(3).getString("name"));
    }

    @Test
    public void deleteSeveralFilesAndOnlyInsideTheInbox() throws Exception {
        String t = pair();
        req("POST", "/api/upload?name=a.mp4", new byte[1000], t);
        req("POST", "/api/upload?name=b.mp4", new byte[2000], t);
        File outside = tmp.newFile("segredo.txt");
        JSONObject r = new JSONObject(req("POST", "/api/v2/storage/delete",
                "{\"files\":[\"a.mp4\",\"b.mp4\",\"../segredo.txt\",\"nao-existe.mp4\"]}", t).body);
        assertEquals(2, r.getInt("deleted"));
        assertEquals(3000, r.getLong("freed"));
        assertTrue("files outside the inbox are never touched", outside.exists());
        assertEquals(400, req("POST", "/api/v2/storage/delete", "{\"files\":[]}", t).code);
    }

    @Test
    public void appSizesCacheAndSettings() throws Exception {
        String t = pair();
        JSONObject apps = new JSONObject(req("GET", "/api/v2/storage/apps", (String) null, t).body);
        assertTrue(apps.getBoolean("permission"));
        assertEquals("Netflix", apps.getJSONArray("apps").getJSONObject(0).getString("label"));
        JSONObject c = new JSONObject(req("POST", "/api/v2/storage/cache", "", t).body);
        assertEquals(5_000_000, c.getLong("freed"));
        assertEquals(200, req("POST", "/api/v2/apps/settings", "{\"pkg\":\"com.netflix.ninja\"}", t).code);
        assertEquals("[com.netflix.ninja]", host.settingsOpened.toString());
        assertEquals(400, req("POST", "/api/v2/apps/settings", "{\"pkg\":\"../x\"}", t).code);
    }

    @Test
    public void needsPairing() throws Exception {
        assertEquals(401, req("GET", "/api/v2/storage", (String) null, null).code);
        assertFalse(host.inbox.listFiles().length > 0);
    }
}
