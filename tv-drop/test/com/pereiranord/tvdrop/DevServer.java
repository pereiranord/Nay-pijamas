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
 *   TVDROP_DEV=600 gradle testTvReleaseUnitTest --tests '*DevServer*'
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
                if (Keys.get(name) == null) return "Tecla desconhecida";
                trackIme(name);
                return null;
            }
        };
        FakeHost host = new FakeHost(inbox) {
            @Override
            public RemoteControl remote() {
                return System.getenv("TVDROP_DEV_LIMITED") != null ? super.remote() : paired;
            }

            @Override
            public byte[] qrPng(String text, int size) { // a real QR for the screenshots
                try {
                    com.google.zxing.common.BitMatrix m = new com.google.zxing.qrcode.QRCodeWriter().encode(text, com.google.zxing.BarcodeFormat.QR_CODE, size, size);
                    return png(m, size);
                } catch (Exception e) {
                    return null;
                }
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
        if (System.getenv("TVDROP_DEV_UPDATE") != null) { // a newer version "on GitHub", to try the update screens
            UpdaterTest gh = new UpdaterTest();
            gh.tmp = new org.junit.rules.TemporaryFolder();
            gh.tmp.create();
            gh.startGithub();
            java.lang.reflect.Field f = UpdaterTest.class.getDeclaredField("base");
            f.setAccessible(true);
            host.updater = new Updater(f.get(gh) + "/update.json", gh.tmp.newFolder(), 24, "2.12.24", "tv",
                    apk -> Events.add("(teste) o Android abriria a instalação de " + apk.getName()), System::currentTimeMillis);
            host.updater.checkAsync();
        }
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

    /** Grayscale PNG of a QR matrix (no java.awt next to android.jar). */
    static byte[] png(com.google.zxing.common.BitMatrix m, int size) throws IOException {
        java.io.ByteArrayOutputStream raw = new java.io.ByteArrayOutputStream();
        for (int y = 0; y < size; y++) {
            raw.write(0);
            for (int x = 0; x < size; x++) raw.write(m.get(x, y) ? 0 : 255);
        }
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        out.write(new byte[]{(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10});
        java.nio.ByteBuffer ihdr = java.nio.ByteBuffer.allocate(13).putInt(size).putInt(size).put((byte) 8).put((byte) 0).put((byte) 0).put((byte) 0).put((byte) 0);
        chunk(out, "IHDR", ihdr.array());
        java.io.ByteArrayOutputStream z = new java.io.ByteArrayOutputStream();
        try (java.util.zip.DeflaterOutputStream d = new java.util.zip.DeflaterOutputStream(z)) { d.write(raw.toByteArray()); }
        chunk(out, "IDAT", z.toByteArray());
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    private static void chunk(java.io.ByteArrayOutputStream out, String type, byte[] data) throws IOException {
        byte[] t = type.getBytes(StandardCharsets.US_ASCII);
        out.write(java.nio.ByteBuffer.allocate(4).putInt(data.length).array());
        out.write(t);
        out.write(data);
        java.util.zip.CRC32 crc = new java.util.zip.CRC32();
        crc.update(t);
        crc.update(data);
        out.write(java.nio.ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
    }
}
