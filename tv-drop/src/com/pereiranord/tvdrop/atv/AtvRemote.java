package com.pereiranord.tvdrop.atv;

import com.pereiranord.tvdrop.KeyValueStore;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Client for the Android TV Remote protocol v2 — the protocol Google's own
 * "Google TV" phone remote uses. It sends any remote key (D-pad, Home, Back,
 * power, volume...), types into the focused text field and opens app links.
 *
 * Pairing (port 6467): TLS with our self-signed client certificate; a few
 * protobuf messages; the TV then shows a 6-character code and the client proves
 * it saw it by sending SHA-256(client modulus, client exponent, server modulus,
 * server exponent, code[2..]) — the first byte of that hash must equal code[0..2].
 * Remote (port 6466): the same certificate; the TV sends configure/active/ping
 * messages that must be answered, then key, text and app-link messages work.
 *
 * Message layouts follow the androidtvremote2 project's polo.proto and
 * remotemessage.proto. TV Drop's receiver uses this to control the TV it runs on
 * (connecting to itself), which is why the web page can work as a full remote.
 */
public class AtvRemote {
    public static final int PAIRING_PORT = 6467;
    public static final int REMOTE_PORT = 6466;
    /** Features we ask for: PING | KEY | IME | POWER | VOLUME | APP_LINK. */
    static final int FEATURES = 1 | 2 | 4 | 32 | 64 | 512;
    static final int STATUS_OK = 200;
    private static final String K_PAIRED = "atv.paired";
    private static final String K_SERVER = "atv.serverCert";
    private static final String K_HOST = "atv.host";

    private final File certFile;
    private final KeyValueStore store;
    private final String clientName;
    private final List<String> hosts;
    private int pairingPort = PAIRING_PORT, remotePort = REMOTE_PORT;

    private KeyStore keyStore;
    private SSLContext ssl;

    // pairing in progress
    private SSLSocket pairingSocket;
    private long pairingStarted;

    // remote session
    private volatile SSLSocket session;
    private volatile OutputStream sessionOut;
    private final Object ready = new Object();
    /** Guards writes to the session and its fields. Never held while waiting for the TV. */
    private final Object writeLock = new Object();
    /** Serialises opening the session. */
    private final Object connectLock = new Object();
    private volatile boolean configured;
    private volatile int imeCounter, fieldCounter;
    private volatile boolean hasImeCounter, hasFieldCounter;
    private volatile String currentApp = "";
    private volatile boolean isOn = true;
    private volatile int volumeLevel = -1, volumeMax = -1;
    private volatile boolean muted;
    private volatile int serverFeatures = -1;
    private volatile String lastError;

    public AtvRemote(File certFile, KeyValueStore store, String clientName, List<String> hosts) {
        this.certFile = certFile;
        this.store = store;
        this.clientName = clientName;
        this.hosts = hosts;
    }

    /** Tests point this at a fake TV. */
    public AtvRemote ports(int pairing, int remote) {
        this.pairingPort = pairing;
        this.remotePort = remote;
        return this;
    }

    public boolean isPaired() {
        return "1".equals(store.get(K_PAIRED));
    }

    public boolean isConnected() {
        SSLSocket s = session;
        return s != null && !s.isClosed() && configured;
    }

    public boolean imeReady() {
        return hasFieldCounter || hasImeCounter;
    }

    public String currentApp() { return currentApp; }
    public boolean isOn() { return isOn; }
    public int volumeLevel() { return volumeLevel; }
    public int volumeMax() { return volumeMax; }
    public boolean muted() { return muted; }
    public int serverFeatures() { return serverFeatures; }
    public String lastError() { return lastError; }

    /** Is something listening on the TV's remote ports? (a quick TCP probe) */
    public boolean serviceAvailable() {
        for (String h : hosts) {
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress(h, pairingPort), 800);
                return true;
            } catch (IOException ignored) {
            }
        }
        return false;
    }

    // ---- TLS ----

    private synchronized SSLContext ssl() throws IOException {
        if (ssl != null) return ssl;
        try {
            keyStore = AtvCert.loadOrCreate(certFile, "atvremote");
            KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(keyStore, AtvCert.PASSWORD);
            // The TV's certificate is self-signed; it is pinned after pairing instead (see checkPin).
            TrustManager trustAll = new X509TrustManager() {
                @Override public void checkClientTrusted(X509Certificate[] c, String a) {}
                @Override public void checkServerTrusted(X509Certificate[] c, String a) {}
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            };
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(kmf.getKeyManagers(), new TrustManager[]{trustAll}, new SecureRandom());
            ssl = ctx;
            return ctx;
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("TLS: " + e.getMessage(), e);
        }
    }

    private SSLSocket connect(int port) throws IOException {
        IOException last = null;
        String saved = store.get(K_HOST);
        String[] order = saved != null ? concat(saved, hosts) : hosts.toArray(new String[0]);
        for (String h : order) {
            try {
                Socket raw = new Socket();
                raw.connect(new InetSocketAddress(h, port), 3000);
                SSLSocket s = (SSLSocket) ssl().getSocketFactory().createSocket(raw, h, port, true);
                s.setSoTimeout(10_000);
                s.startHandshake();
                store.put(K_HOST, h);
                return s;
            } catch (IOException e) {
                last = e;
            }
        }
        throw last != null ? last : new IOException("sem endereço da TV");
    }

    private static String[] concat(String first, List<String> rest) {
        String[] out = new String[rest.size() + 1];
        out[0] = first;
        for (int i = 0; i < rest.size(); i++) out[i + 1] = rest.get(i);
        return out;
    }

    // ---- pairing ----

    private static Proto outer() {
        return new Proto().varint(1, 2).varint(2, STATUS_OK);
    }

    /** Starts pairing; when this returns, the TV is showing a 6-character code. */
    public synchronized void startPairing() throws IOException {
        closePairing();
        SSLSocket s = connect(pairingPort);
        try {
            s.setSoTimeout(10_000);
            OutputStream out = s.getOutputStream();
            InputStream in = s.getInputStream();
            Proto.writeFramed(out, outer().message(10, new Proto().string(1, "atvremote").string(2, clientName)).toByteArray());
            expect(in, 11, "pairing_request_ack");
            Proto.writeFramed(out, outer().message(20, new Proto()
                    .message(1, new Proto().varint(1, 3).varint(2, 6)) // HEXADECIMAL, 6 symbols
                    .varint(3, 1)).toByteArray());                     // ROLE_TYPE_INPUT
            expect(in, 20, "options");
            Proto.writeFramed(out, outer().message(30, new Proto()
                    .message(1, new Proto().varint(1, 3).varint(2, 6))
                    .varint(2, 1)).toByteArray());
            expect(in, 31, "configuration_ack");
            pairingSocket = s;
            pairingStarted = System.currentTimeMillis();
        } catch (IOException e) {
            closeQuietly(s);
            throw e;
        }
    }

    /** Finishes pairing with the code the TV shows. Throws IllegalArgumentException for a wrong code. */
    public synchronized void finishPairing(String code) throws IOException {
        String c = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (!c.matches("[0-9A-F]{6}")) throw new IllegalArgumentException("O código tem 6 letras/números (0-9, A-F).");
        SSLSocket s = pairingSocket;
        if (s == null || s.isClosed() || System.currentTimeMillis() - pairingStarted > 10 * 60_000) {
            throw new IllegalStateException("O pareamento expirou. Comece de novo.");
        }
        try {
            X509Certificate client = AtvCert.certificate(keyStore);
            X509Certificate server = (X509Certificate) s.getSession().getPeerCertificates()[0];
            byte[] secret = secret(client, server, c);
            if (secret == null) throw new IllegalArgumentException("Código incorreto. Confira o código na TV.");
            Proto.writeFramed(s.getOutputStream(), outer().message(40, new Proto().bytes(1, secret)).toByteArray());
            expect(s.getInputStream(), 41, "secret_ack");
            store.put(K_SERVER, fingerprint(server));
            store.put(K_PAIRED, "1");
            lastError = null;
        } finally {
            closePairing();
        }
    }

    /**
     * SHA-256(client n, client e, server n, server e, code bytes after the first) — integers as
     * minimal big-endian bytes. Returns null when its first byte doesn't match the code's first byte.
     */
    static byte[] secret(X509Certificate client, X509Certificate server, String code) throws IOException {
        try {
            RSAPublicKey ck = (RSAPublicKey) client.getPublicKey();
            RSAPublicKey sk = (RSAPublicKey) server.getPublicKey();
            MessageDigest h = MessageDigest.getInstance("SHA-256");
            h.update(unsigned(ck.getModulus()));
            h.update(unsigned(ck.getPublicExponent()));
            h.update(unsigned(sk.getModulus()));
            h.update(unsigned(sk.getPublicExponent()));
            h.update(hexBytes(code.substring(2)));
            byte[] d = h.digest();
            return (d[0] & 0xff) == Integer.parseInt(code.substring(0, 2), 16) ? d : null;
        } catch (java.security.GeneralSecurityException | RuntimeException e) {
            throw new IOException(e);
        }
    }

    static byte[] unsigned(BigInteger v) {
        byte[] b = v.toByteArray();
        return b.length > 1 && b[0] == 0 ? Arrays.copyOfRange(b, 1, b.length) : b;
    }

    static byte[] hexBytes(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(hex.substring(2 * i, 2 * i + 2), 16);
        return out;
    }

    private static Proto.Msg expect(InputStream in, int field, String what) throws IOException {
        Proto.Msg m = Proto.Msg.parse(Proto.readFramed(in));
        long status = m.num(2, 0);
        if (status != STATUS_OK) {
            throw new IOException(status == 402 ? "Código recusado pela TV" : "A TV recusou (" + what + ", status " + status + ")");
        }
        if (!m.has(field)) throw new IOException("Resposta inesperada da TV (esperava " + what + ")");
        return m;
    }

    private void closePairing() {
        closeQuietly(pairingSocket);
        pairingSocket = null;
    }

    public void unpair() {
        closeSession();
        store.put(K_PAIRED, null);
        store.put(K_SERVER, null);
    }

    // ---- remote session ----

    /** Opens the remote session if needed and waits until the TV has configured it. */
    private OutputStream ensureSession() throws IOException {
        synchronized (connectLock) {
            return openSession();
        }
    }

    private OutputStream openSession() throws IOException {
        if (!isPaired()) throw new IllegalStateException("O controle ainda não foi pareado com a TV.");
        SSLSocket cur = session;
        OutputStream curOut = sessionOut;
        if (cur != null && !cur.isClosed() && curOut != null) return curOut;
        SSLSocket s = connect(remotePort);
        String pin = store.get(K_SERVER);
        try {
            X509Certificate server = (X509Certificate) s.getSession().getPeerCertificates()[0];
            if (pin != null && !pin.equals(fingerprint(server))) {
                closeQuietly(s);
                unpair();
                throw new CertificateChanged();
            }
        } catch (javax.net.ssl.SSLPeerUnverifiedException e) {
            closeQuietly(s);
            throw new IOException(e);
        }
        s.setSoTimeout(0);
        synchronized (writeLock) {
            session = s;
            sessionOut = s.getOutputStream();
            configured = false;
        }
        final SSLSocket mine = s;
        Thread reader = new Thread(() -> readLoop(mine), "atv-remote");
        reader.setDaemon(true);
        reader.start();
        synchronized (ready) {
            long until = System.currentTimeMillis() + 4000;
            while (!configured && System.currentTimeMillis() < until && !mine.isClosed()) {
                try {
                    ready.wait(200);
                } catch (InterruptedException e) {
                    break;
                }
            }
        }
        if (mine.isClosed()) throw new IOException(lastError != null ? lastError : "A TV fechou a conexão do controle");
        return sessionOut;
    }

    private void readLoop(SSLSocket s) {
        try {
            InputStream in = s.getInputStream();
            while (true) {
                Proto.Msg m = Proto.Msg.parse(Proto.readFramed(in));
                Proto reply = handle(m);
                if (reply != null) {
                    synchronized (writeLock) {
                        if (session == s) Proto.writeFramed(sessionOut, reply.toByteArray());
                    }
                }
            }
        } catch (IOException e) {
            lastError = e.getMessage();
        } finally {
            closeQuietly(s);
            synchronized (writeLock) {
                if (session == s) {
                    session = null;
                    sessionOut = null;
                    configured = false;
                }
            }
            synchronized (ready) {
                ready.notifyAll();
            }
        }
    }

    /** Answers the TV's messages and records its state. */
    Proto handle(Proto.Msg m) throws IOException {
        if (m.has(1)) { // remote_configure
            Proto.Msg cfg = m.msg(1);
            serverFeatures = (int) cfg.num(1, FEATURES);
            int active = FEATURES & serverFeatures;
            return new Proto().message(1, new Proto().varint(1, active).message(2, new Proto()
                    .varint(3, 1).string(4, "1").string(5, "atvremote").string(6, "1.0.0")));
        }
        if (m.has(2)) { // remote_set_active
            markConfigured();
            return new Proto().message(2, new Proto().varint(1, FEATURES & (serverFeatures < 0 ? FEATURES : serverFeatures)));
        }
        if (m.has(8)) { // ping
            markConfigured();
            return new Proto().message(9, new Proto().varint(1, m.msg(8).num(1, 0)));
        }
        if (m.has(20)) { // remote_ime_key_inject
            Proto.Msg inj = m.msg(20);
            Proto.Msg app = inj.msg(1);
            String pkg = app.str(12);
            if (pkg != null) currentApp = pkg;
            imeCounter = (int) app.num(1, 0);
            fieldCounter = (int) inj.msg(2).num(1, 0);
            hasImeCounter = imeCounter != 0;
            hasFieldCounter = fieldCounter != 0;
        } else if (m.has(22)) { // remote_ime_show_request
            Proto.Msg st = m.msg(22);
            if (st.has(2)) {
                fieldCounter = (int) st.msg(2).num(1, 0);
                hasFieldCounter = true;
            }
        } else if (m.has(21)) { // remote_ime_batch_edit
            Proto.Msg be = m.msg(21);
            if (!hasImeCounter) imeCounter = (int) be.num(1, 0);
            if (!hasFieldCounter) fieldCounter = (int) be.num(2, 0);
        } else if (m.has(50)) { // remote_set_volume_level
            Proto.Msg v = m.msg(50);
            volumeMax = (int) v.num(6, -1);
            volumeLevel = (int) v.num(7, -1);
            muted = v.num(8, 0) != 0;
        } else if (m.has(40)) { // remote_start
            isOn = m.msg(40).num(1, 0) != 0;
            markConfigured();
        } else if (m.has(3)) { // remote_error
            lastError = "A TV respondeu com erro";
        }
        return null;
    }

    private void markConfigured() {
        configured = true;
        synchronized (ready) {
            ready.notifyAll();
        }
    }

    private void send(Proto msg) throws IOException {
        IOException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                OutputStream out = ensureSession();
                synchronized (writeLock) {
                    Proto.writeFramed(out, msg.toByteArray());
                }
                return;
            } catch (CertificateChanged e) {
                throw e;
            } catch (IOException e) {
                last = e;
                closeSession();
            }
        }
        throw last;
    }

    /** A short key press (Android KeyEvent code). */
    public void sendKey(int keyCode) throws IOException {
        send(new Proto().message(10, new Proto().varint(1, keyCode).varint(2, 3))); // SHORT
    }

    /** Inserts text at the cursor of the focused text field. */
    public void sendText(String text) throws IOException {
        Proto obj = new Proto().varint(1, text.length()).varint(2, text.length()).string(3, text);
        Proto edit = new Proto().varint(1, 1).message(2, obj);
        send(new Proto().message(21, new Proto().varint(1, imeCounter).varint(2, fieldCounter).message(3, edit)));
    }

    /** Opens an app link (e.g. "https://www.youtube.com") on the TV. */
    public void launchLink(String link) throws IOException {
        send(new Proto().message(90, new Proto().string(1, link)));
    }

    public void closeSession() {
        synchronized (writeLock) {
            closeQuietly(session);
            session = null;
            sessionOut = null;
            configured = false;
        }
    }

    /** The TV answered with a different certificate than the one it paired with. */
    public static final class CertificateChanged extends IOException {
        CertificateChanged() {
            super("A TV apresentou outro certificado. Pareie o controle de novo.");
        }
    }

    static String fingerprint(X509Certificate c) throws IOException {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(c.getEncoded());
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    private static void closeQuietly(Socket s) {
        if (s == null) return;
        try {
            s.close();
        } catch (IOException ignored) {
        }
    }
}
