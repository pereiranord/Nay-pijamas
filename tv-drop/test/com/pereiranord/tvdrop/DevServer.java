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
        FakeHost host = new FakeHost(inbox) {
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
        if (info != null) Files.write(new File(info).toPath(), (server.port() + " " + pairing.pin()).getBytes(StandardCharsets.UTF_8));
        Thread.sleep(Long.parseLong(secs) * 1000);
        server.shutdown();
    }
}
