package com.pereiranord.tvdrop;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** A phone asks the TV to update itself; the TV installs only what GitHub published for the TV. */
public class UpdateApiTest extends ServerTestBase {

    @Test
    public void withoutUpdaterTheRouteSaysSo() throws Exception {
        String t = pair();
        assertEquals(404, req("GET", "/api/v2/update", (String) null, t).code);
    }

    @Test
    public void updateNeedsAPairedDevice() throws Exception {
        host.updater = new Updater("http://127.0.0.1:1/update.json", tmp.newFolder(), 24, "2.12.24", "tv", f -> { }, () -> 0L);
        assertEquals(401, req("GET", "/api/v2/update", (String) null, null).code);
        assertEquals(401, req("POST", "/api/v2/update/install", "{}", null).code);
    }

    @Test
    public void statusAndInstallFromThePhone() throws Exception {
        UpdaterTest gh = new UpdaterTest();
        gh.tmp = tmp;
        gh.startGithub();
        try {
            List<File> installed = new ArrayList<>();
            java.lang.reflect.Field base = UpdaterTest.class.getDeclaredField("base");
            base.setAccessible(true);
            host.updater = new Updater(base.get(gh) + "/update.json", tmp.newFolder(), 24, "2.12.24", "tv", installed::add, () -> 0L);
            String t = pair();
            JSONObject s = new JSONObject(req("GET", "/api/v2/update", (String) null, t).body);
            assertEquals("2.12.24", s.getString("current"));
            assertEquals(409, req("POST", "/api/v2/update/install", "{}", t).code); // not checked yet: nothing to install
            assertEquals(200, req("POST", "/api/v2/update/check", "{}", t).code);
            for (int i = 0; i < 50 && !host.updater.available(); i++) Thread.sleep(50);
            assertTrue(new JSONObject(req("GET", "/api/v2/update", (String) null, t).body).getBoolean("available"));
            Res r = req("POST", "/api/v2/update/install", "{}", t);
            assertEquals(r.body, 200, r.code);
            for (int i = 0; i < 100 && installed.isEmpty(); i++) Thread.sleep(50);
            assertEquals("the TV's APK reached Android's installer", 1, installed.size());
        } finally {
            gh.stop();
        }
    }
}
