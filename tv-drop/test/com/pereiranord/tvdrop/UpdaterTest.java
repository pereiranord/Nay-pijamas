package com.pereiranord.tvdrop;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/** The app updating itself: a local server plays GitHub's role (update.json + the APKs). */
public class UpdaterTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private java.net.ServerSocket gh;
    private String base;
    private byte[] tvApk, phoneApk;
    private volatile String feed;
    private final List<File> installed = new ArrayList<>();

    @Before
    public void startGithub() throws Exception {
        tvApk = new byte[300_000];
        phoneApk = new byte[200_000];
        for (int i = 0; i < tvApk.length; i++) tvApk[i] = (byte) (i * 7);
        for (int i = 0; i < phoneApk.length; i++) phoneApk[i] = (byte) (i * 3);
        gh = new java.net.ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"));
        Thread t = new Thread(() -> {
            while (!gh.isClosed()) {
                try (java.net.Socket s = gh.accept()) {
                    java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
                    String line = r.readLine();
                    while (true) { String h = r.readLine(); if (h == null || h.isEmpty()) break; }
                    String path = line == null ? "" : line.split(" ")[1];
                    byte[] body = path.equals("/TV-Drop.apk") ? tvApk : path.equals("/TV-Drop-Celular.apk") ? phoneApk
                            : path.equals("/update.json") ? feed.getBytes(StandardCharsets.UTF_8) : null;
                    OutputStream o = s.getOutputStream();
                    if (body == null) o.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                    else {
                        o.write(("HTTP/1.1 200 OK\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        o.write(body);
                    }
                    o.flush();
                } catch (IOException ignored) {
                }
            }
        });
        t.setDaemon(true);
        t.start();
        base = "http://127.0.0.1:" + gh.getLocalPort();
        feed = feedFor(30, sha(tvApk), sha(phoneApk));
    }

    @After
    public void stop() throws IOException {
        gh.close();
    }

    private String feedFor(int code, String tvSha, String phoneSha) throws Exception {
        return new JSONObject().put("versionCode", code).put("versionName", "2.12." + code).put("notes", "Novidades")
                .put("apks", new JSONObject()
                        .put("tv", new JSONObject().put("url", base + "/TV-Drop.apk").put("sha256", tvSha).put("size", tvApk.length))
                        .put("celular", new JSONObject().put("url", base + "/TV-Drop-Celular.apk").put("sha256", phoneSha).put("size", phoneApk.length)))
                .toString();
    }

    private Updater updater(int current, String kind) throws IOException {
        return new Updater(base + "/update.json", tmp.newFolder(), current, "2.12." + current, kind, installed::add, () -> 1234L);
    }

    static String sha(byte[] b) throws Exception {
        return Updater.hex(MessageDigest.getInstance("SHA-256").digest(b));
    }

    @Test
    public void aNewerReleaseIsOfferedAndTheRightApkIsInstalled() throws Exception {
        Updater u = updater(24, "tv");
        assertNotNull(u.check());
        JSONObject s = u.status();
        assertEquals("available", s.getString("state"));
        assertEquals("2.12.30", s.getString("latest"));
        assertTrue(s.getBoolean("available"));
        u.install();
        assertEquals(1, installed.size());
        assertTrue("the TV gets the TV APK", java.util.Arrays.equals(tvApk, Files.readAllBytes(installed.get(0).toPath())));
        assertEquals("installing", u.status().getString("state"));
        u.installResult(true, null);
        assertEquals("latest", u.status().getString("state"));
    }

    @Test
    public void aPhoneGetsThePhoneApk() throws Exception {
        Updater u = updater(24, "celular");
        u.check();
        u.install();
        assertTrue(java.util.Arrays.equals(phoneApk, Files.readAllBytes(installed.get(0).toPath())));
    }

    @Test
    public void theSameOrAnOlderVersionIsNotOffered() throws Exception {
        assertNull(updater(30, "tv").check());
        Updater newer = updater(31, "tv");
        assertNull(newer.check());
        assertEquals("latest", newer.status().getString("state"));
        try {
            newer.install();
            fail("nothing to install");
        } catch (IOException expected) {
        }
        assertTrue(installed.isEmpty());
    }

    @Test
    public void aDownloadThatDoesNotMatchTheSha256IsThrownAway() throws Exception {
        feed = feedFor(30, sha(phoneApk), sha(phoneApk)); // the TV's entry announces another file's hash
        Updater u = updater(24, "tv");
        u.check();
        try {
            u.install();
            fail("a wrong file must not be installed");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("SHA-256"));
        }
        assertTrue("nothing reached the installer", installed.isEmpty());
        assertEquals("error", u.status().getString("state"));
        File[] left = installed.isEmpty() ? new File[0] : null;
        assertNotNull(left);
    }

    @Test
    public void aFeedPointingOutsideGithubIsRefused() throws Exception {
        feed = new JSONObject(feedFor(30, sha(tvApk), sha(phoneApk))).put("apks", new JSONObject()
                .put("tv", new JSONObject().put("url", "https://example.com/TV-Drop.apk").put("sha256", sha(tvApk)).put("size", tvApk.length))).toString();
        try {
            updater(24, "tv").check();
            fail("must refuse");
        } catch (IOException expected) {
        }
    }

    @Test
    public void noNetworkIsAnErrorTheScreensCanShow() throws Exception {
        Updater u = new Updater("http://127.0.0.1:1/update.json", tmp.newFolder(), 24, "2.12.24", "tv", installed::add, () -> 0L);
        try {
            u.check();
            fail();
        } catch (IOException expected) {
        }
        JSONObject s = u.status();
        assertEquals("error", s.getString("state"));
        assertTrue(s.getString("message").startsWith("Não consegui"));
        assertFalse(s.has("latest"));
    }
}
