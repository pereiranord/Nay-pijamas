package com.pereiranord.tvdrop.atv;

import com.pereiranord.tvdrop.KeyValueStore;

import org.junit.After;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.Collections;
import java.util.Locale;
import java.util.Random;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Talks to a fake Android TV that implements the server side of the pairing and
 * remote protocols over real TLS, computing the pairing code the way the TV does.
 */
public class AtvRemoteTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private FakeTv tv;

    @After
    public void stop() {
        if (tv != null) tv.close();
    }

    private AtvRemote client(KeyValueStore store) throws IOException {
        return new AtvRemote(new java.io.File(tmp.getRoot(), "client.p12"), store, "TV Drop",
                Collections.singletonList("127.0.0.1")).ports(tv.pairingPort, tv.remotePort);
    }

    @Test
    public void unsignedBytesDropTheSignByte() {
        assertArrayEquals(new byte[]{1, 0, 1}, AtvRemote.unsigned(BigInteger.valueOf(65537)));
        assertArrayEquals(new byte[]{(byte) 0xff}, AtvRemote.unsigned(BigInteger.valueOf(255)));
    }

    @Test
    public void certificateIsCreatedOnceAndReused() throws Exception {
        java.io.File f = new java.io.File(tmp.getRoot(), "c.p12");
        KeyStore a = AtvCert.loadOrCreate(f, "atvremote");
        KeyStore b = AtvCert.loadOrCreate(f, "atvremote");
        assertEquals(AtvCert.certificate(a), AtvCert.certificate(b));
        assertEquals("CN=atvremote", AtvCert.certificate(a).getSubjectX500Principal().getName());
    }

    @Test
    public void pairsWithTheCodeShownOnTheTv() throws Exception {
        tv = new FakeTv();
        KeyValueStore store = new KeyValueStore.Memory();
        AtvRemote r = client(store);
        assertFalse(r.isPaired());
        r.startPairing();
        String code = tv.shownCode.poll(5, TimeUnit.SECONDS);
        assertNotNull("the TV should be showing a code", code);
        assertEquals("TV Drop", tv.clientName);
        r.finishPairing(code.toLowerCase(Locale.ROOT)); // case doesn't matter
        assertTrue(r.isPaired());
        assertTrue(tv.secretAccepted);
    }

    @Test
    public void wrongCodeIsCaughtBeforeSending() throws Exception {
        tv = new FakeTv();
        AtvRemote r = client(new KeyValueStore.Memory());
        r.startPairing();
        String code = tv.shownCode.poll(5, TimeUnit.SECONDS);
        int first = Integer.parseInt(code.substring(0, 2), 16);
        String wrong = String.format(Locale.ROOT, "%02X", (first + 1) & 0xff) + code.substring(2);
        try {
            r.finishPairing(wrong);
            fail("wrong code accepted");
        } catch (IllegalArgumentException expected) {
        }
        assertFalse(r.isPaired());
        try {
            r.finishPairing("12345");
            fail("short code accepted");
        } catch (IllegalArgumentException expected) {
        }
    }

    @Test
    public void sessionAnswersTheTvAndSendsKeysTextAndLinks() throws Exception {
        tv = new FakeTv();
        AtvRemote r = client(new KeyValueStore.Memory());
        r.startPairing();
        r.finishPairing(tv.shownCode.poll(5, TimeUnit.SECONDS));

        r.sendKey(19); // DPAD_UP
        Proto.Msg key = tv.received.poll(5, TimeUnit.SECONDS);
        assertNotNull(key);
        assertEquals("configure must be answered with our features", AtvRemote.FEATURES & 622, tv.configuredFeatures);
        for (int i = 0; i < 50 && !tv.pongOk; i++) Thread.sleep(50); // the ping answer may follow the key
        assertTrue("ping must be answered", tv.pongOk);
        assertEquals(19, key.msg(10).num(1, 0));
        assertEquals(3, key.msg(10).num(2, 0)); // SHORT
        assertTrue(r.isConnected());
        assertEquals("com.google.android.youtube.tv", r.currentApp());
        assertTrue(r.imeReady());

        r.sendText("abc");
        Proto.Msg text = tv.received.poll(5, TimeUnit.SECONDS);
        Proto.Msg be = text.msg(21);
        assertEquals(5, be.num(1, 0)); // ime counter from the TV
        assertEquals(9, be.num(2, 0)); // field counter from the TV
        Proto.Msg edit = be.msg(3);
        assertEquals(1, edit.num(1, 0));
        assertEquals("abc", edit.msg(2).str(3));
        assertEquals(3, edit.msg(2).num(1, 0));

        r.launchLink("https://www.youtube.com");
        assertEquals("https://www.youtube.com", tv.received.poll(5, TimeUnit.SECONDS).msg(90).str(1));
        assertEquals(30, r.volumeMax());
        assertEquals(12, r.volumeLevel());
    }

    @Test
    public void reconnectsAfterTheTvDropsTheConnection() throws Exception {
        tv = new FakeTv();
        AtvRemote r = client(new KeyValueStore.Memory());
        r.startPairing();
        r.finishPairing(tv.shownCode.poll(5, TimeUnit.SECONDS));
        r.sendKey(3);
        assertEquals(3, tv.received.poll(5, TimeUnit.SECONDS).msg(10).num(1, 0));
        tv.dropSessions();
        // wait until the client has noticed the drop (slow CI machines take longer)
        for (int i = 0; i < 100 && r.isConnected(); i++) Thread.sleep(50);
        assertFalse("the client should notice the TV closed the connection", r.isConnected());
        // The background reconnect and the key press may race on a slow machine; like a person would,
        // press again until the TV gets it (it must arrive within a few seconds).
        Proto.Msg key = null;
        for (int i = 0; i < 6 && key == null; i++) {
            try { r.sendKey(4); } catch (Exception ignored) { }
            Proto.Msg m = tv.received.poll(2, TimeUnit.SECONDS);
            while (m != null && (m.all(10) == null || m.all(10).isEmpty())) m = tv.received.poll(200, TimeUnit.MILLISECONDS);
            key = m;
        }
        assertTrue("the key should reach the TV after the reconnection", key != null);
        assertEquals(4, key.msg(10).num(1, 0));
    }

    @Test
    public void anotherTvCertificateRequiresPairingAgain() throws Exception {
        tv = new FakeTv();
        KeyValueStore store = new KeyValueStore.Memory();
        AtvRemote r = client(store);
        r.startPairing();
        r.finishPairing(tv.shownCode.poll(5, TimeUnit.SECONDS));
        int pp = tv.pairingPort, rp = tv.remotePort;
        tv.close();
        tv = new FakeTv(pp, rp); // same address, different certificate
        try {
            r.sendKey(19);
            fail("must not talk to a TV with another certificate");
        } catch (AtvRemote.CertificateChanged expected) {
        }
        assertFalse(r.isPaired());
    }

    @Test
    public void keysBeforePairingAreRefused() throws Exception {
        tv = new FakeTv();
        AtvRemote r = client(new KeyValueStore.Memory());
        try {
            r.sendKey(19);
            fail();
        } catch (IllegalStateException expected) {
        }
    }

    // ---------------------------------------------------------------------------------------

    /** Server side of the protocol, as an Android TV implements it. */
    static final class FakeTv {
        final int pairingPort, remotePort;
        final BlockingQueue<String> shownCode = new LinkedBlockingQueue<>();
        final BlockingQueue<Proto.Msg> received = new LinkedBlockingQueue<>();
        volatile String clientName;
        volatile boolean secretAccepted, pongOk;
        volatile int configuredFeatures = -1;
        private final SSLServerSocket pairing, remote;
        private final java.util.List<SSLSocket> sessions = new java.util.concurrent.CopyOnWriteArrayList<>();
        private volatile boolean closed;

        FakeTv() throws Exception {
            this(0, 0);
        }

        FakeTv(int pairingPortWanted, int remotePortWanted) throws Exception {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            KeyPair kp = g.generateKeyPair();
            X509Certificate cert = AtvCert.selfSigned(kp, "FakeTV");
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(null, null);
            ks.setKeyEntry("tv", kp.getPrivate(), "x".toCharArray(), new Certificate[]{cert});
            KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(ks, "x".toCharArray());
            TrustManager trustAll = new X509TrustManager() {
                @Override public void checkClientTrusted(X509Certificate[] c, String a) {}
                @Override public void checkServerTrusted(X509Certificate[] c, String a) {}
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            };
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(kmf.getKeyManagers(), new TrustManager[]{trustAll}, new SecureRandom());
            pairing = bind(ctx, pairingPortWanted);
            remote = bind(ctx, remotePortWanted);
            pairingPort = pairing.getLocalPort();
            remotePort = remote.getLocalPort();
            thread(() -> { while (!closed) servePairing((SSLSocket) pairing.accept(), cert); });
            thread(() -> { while (!closed) { SSLSocket s = (SSLSocket) remote.accept(); sessions.add(s); thread(() -> serveRemote(s)); } });
        }

        private static SSLServerSocket bind(SSLContext ctx, int port) throws IOException {
            SSLServerSocket s = (SSLServerSocket) ctx.getServerSocketFactory().createServerSocket();
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress("127.0.0.1", port));
            s.setNeedClientAuth(true);
            return s;
        }

        interface Body { void run() throws Exception; }

        private void thread(Body b) {
            Thread t = new Thread(() -> {
                try {
                    b.run();
                } catch (Exception ignored) {
                }
            });
            t.setDaemon(true);
            t.start();
        }

        private static Proto outer(int status) {
            return new Proto().varint(1, 2).varint(2, status);
        }

        private void servePairing(SSLSocket s, X509Certificate serverCert) throws Exception {
            try (SSLSocket sock = s) {
                InputStream in = sock.getInputStream();
                OutputStream out = sock.getOutputStream();
                Proto.Msg req = Proto.Msg.parse(Proto.readFramed(in));
                clientName = req.msg(10).str(2);
                Proto.writeFramed(out, outer(200).message(11, new Proto().string(1, "FakeTV")).toByteArray());
                Proto.Msg opts = Proto.Msg.parse(Proto.readFramed(in));
                if (opts.msg(20).msg(1).num(1, 0) != 3) throw new IOException("expected hex encoding");
                Proto.writeFramed(out, outer(200).message(20, new Proto().message(1, new Proto().varint(1, 3).varint(2, 6))
                        .varint(3, 1)).toByteArray());
                Proto.Msg conf = Proto.Msg.parse(Proto.readFramed(in));
                if (!conf.has(30)) throw new IOException("expected configuration");
                Proto.writeFramed(out, outer(200).message(31, new Proto()).toByteArray());

                X509Certificate client = (X509Certificate) sock.getSession().getPeerCertificates()[0];
                byte[] nonce = new byte[2];
                new Random().nextBytes(nonce);
                byte[] hash = hash(client, serverCert, nonce);
                shownCode.add(String.format(Locale.ROOT, "%02X%02X%02X", hash[0] & 0xff, nonce[0] & 0xff, nonce[1] & 0xff));

                Proto.Msg secret = Proto.Msg.parse(Proto.readFramed(in));
                boolean ok = MessageDigest.isEqual(hash, secret.msg(40).raw(1));
                secretAccepted = ok;
                Proto.writeFramed(out, (ok ? outer(200).message(41, new Proto().bytes(1, hash)) : outer(402)).toByteArray());
            }
        }

        /** The TV's own computation, written independently of AtvRemote.secret(). */
        private static byte[] hash(X509Certificate client, X509Certificate server, byte[] nonce) throws Exception {
            MessageDigest h = MessageDigest.getInstance("SHA-256");
            for (X509Certificate c : new X509Certificate[]{client, server}) {
                RSAPublicKey k = (RSAPublicKey) c.getPublicKey();
                h.update(minimal(k.getModulus()));
                h.update(minimal(k.getPublicExponent()));
            }
            h.update(nonce);
            return h.digest();
        }

        private static byte[] minimal(BigInteger v) {
            String hex = v.toString(16);
            if (hex.length() % 2 == 1) hex = "0" + hex;
            byte[] b = new byte[hex.length() / 2];
            for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(hex.substring(2 * i, 2 * i + 2), 16);
            return b;
        }

        private void serveRemote(SSLSocket s) throws Exception {
            try (SSLSocket sock = s) {
                InputStream in = sock.getInputStream();
                OutputStream out = sock.getOutputStream();
                Proto.writeFramed(out, new Proto().message(1, new Proto().varint(1, 622)
                        .message(2, new Proto().string(1, "FakeTV").string(2, "Test"))).toByteArray());
                Proto.Msg cfg = Proto.Msg.parse(Proto.readFramed(in));
                configuredFeatures = (int) cfg.msg(1).num(1, -1);
                Proto.writeFramed(out, new Proto().message(2, new Proto().varint(1, 622)).toByteArray());
                Proto.Msg act = Proto.Msg.parse(Proto.readFramed(in));
                if (!act.has(2)) throw new IOException("expected set_active");
                Proto.writeFramed(out, new Proto().message(40, new Proto().varint(1, 1)).toByteArray());
                Proto.writeFramed(out, new Proto().message(50, new Proto().varint(6, 30).varint(7, 12)).toByteArray());
                Proto.writeFramed(out, new Proto().message(20, new Proto()
                        .message(1, new Proto().varint(1, 5).string(12, "com.google.android.youtube.tv"))
                        .message(2, new Proto().varint(1, 9))).toByteArray());
                Proto.writeFramed(out, new Proto().message(8, new Proto().varint(1, 42)).toByteArray());
                while (!closed) {
                    Proto.Msg m = Proto.Msg.parse(Proto.readFramed(in));
                    if (m.has(9)) {
                        pongOk = m.msg(9).num(1, 0) == 42;
                        continue;
                    }
                    received.add(m);
                }
            }
        }

        void dropSessions() {
            for (SSLSocket s : sessions) {
                try {
                    s.close();
                } catch (IOException ignored) {
                }
            }
            sessions.clear();
        }

        void close() {
            closed = true;
            dropSessions();
            try {
                pairing.close();
                remote.close();
            } catch (IOException ignored) {
            }
        }
    }
}
