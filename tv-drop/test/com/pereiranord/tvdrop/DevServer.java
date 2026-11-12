package com.pereiranord.tvdrop;

import org.junit.Assume;
import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;

/**
 * Not a regular test: serves the real web interface (assets/web) backed by the
 * fake TV, for trying the UI in a browser. Runs only with TVDROP_DEV=<seconds>:
 *   TVDROP_DEV=600 gradle testReleaseUnitTest --tests '*DevServer*'
 * It writes "port pin" to the file named by TVDROP_DEV_INFO (if set).
 */
public class DevServer {
    @Test
    public void serve() throws Exception {
        String secs = System.getenv("TVDROP_DEV");
        Assume.assumeTrue(secs != null);
        File inbox = Files.createTempDirectory("tvdrop-inbox").toFile();
        final FakeHost.FakeRemote paired = new FakeHost.FakeRemote() {
            @Override
            public org.json.JSONObject capabilities() {
                try {
                    org.json.JSONArray keys = new org.json.JSONArray();
                    for (String k : Keys.all().keySet()) keys.put(k);
                    return new org.json.JSONObject().put("keys", keys).put("text", true).put("pointer", true).put("power", true)
                            .put("atv", new org.json.JSONObject().put("paired", true).put("available", true).put("connected", true)
                                    .put("currentApp", "com.netflix.ninja").put("volumeLevel", 12).put("volumeMax", 30).put("muted", false))
                            .put("accessibility", new org.json.JSONObject().put("enabled", true).put("dpad", false));
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }

            @Override
            public String key(String name) {
                return Keys.get(name) == null ? "Tecla desconhecida" : null;
            }
        };
        FakeHost host = new FakeHost(inbox) {
            @Override
            public RemoteControl remote() {
                return System.getenv("TVDROP_DEV_LIMITED") != null ? super.remote() : paired;
            }

            @Override
            public byte[] webAsset(String name) {
                File f = new File("assets/web", name);
                try {
                    return f.isFile() ? Files.readAllBytes(f.toPath()) : null;
                } catch (IOException e) {
                    return null;
                }
            }
        };
        Pairing pairing = new Pairing(new KeyValueStore.Memory());
        HttpServer server = new HttpServer(host, pairing);
        if (!server.open(18080, 20)) throw new IllegalStateException("no port");
        server.start();
        String info = System.getenv("TVDROP_DEV_INFO");
        long end = System.currentTimeMillis() + Long.parseLong(secs) * 1000;
        while (System.currentTimeMillis() < end) {
            // the PIN changes after each pairing and every 2 minutes: keep the file current
            if (info != null) Files.write(new File(info).toPath(), (server.port() + " " + pairing.pin() + " " + server.games.open() + " " + server.games.hostKey()).getBytes(StandardCharsets.UTF_8));
            Thread.sleep(500);
        }
        server.shutdown();
    }
}
