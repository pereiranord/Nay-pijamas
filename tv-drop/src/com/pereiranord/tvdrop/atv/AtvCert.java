package com.pereiranord.tvdrop.atv;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The client certificate the Android TV Remote protocol requires. The TV only
 * uses it to recognise this client again, so a self-signed RSA certificate is
 * enough. It is built by hand (DER) because Android has no public API for that,
 * and stored in a PKCS#12 file in the app's private storage.
 */
public final class AtvCert {
    static final String ALIAS = "atvremote";
    static final char[] PASSWORD = "tvdrop".toCharArray();

    private AtvCert() {}

    /** Loads the key store at {@code file}, creating a new key and certificate the first time. */
    public static KeyStore loadOrCreate(File file, String commonName) throws IOException {
        try {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            if (file.isFile()) {
                try (InputStream in = new FileInputStream(file)) {
                    ks.load(in, PASSWORD);
                }
                if (ks.getKey(ALIAS, PASSWORD) != null) return ks;
            }
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048, new SecureRandom());
            KeyPair kp = g.generateKeyPair();
            X509Certificate cert = selfSigned(kp, commonName);
            ks.load(null, null);
            ks.setKeyEntry(ALIAS, kp.getPrivate(), PASSWORD, new Certificate[]{cert});
            File tmp = new File(file.getPath() + ".tmp");
            try (OutputStream out = new FileOutputStream(tmp)) {
                ks.store(out, PASSWORD);
            }
            if (!tmp.renameTo(file)) throw new IOException("não consegui salvar o certificado");
            return ks;
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("certificado: " + e.getMessage(), e);
        }
    }

    public static X509Certificate certificate(KeyStore ks) throws IOException {
        try {
            return (X509Certificate) ks.getCertificate(ALIAS);
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    /** A self-signed X.509 v3 certificate (SHA256withRSA), valid until 2049. */
    static X509Certificate selfSigned(KeyPair kp, String cn) throws Exception {
        byte[] sigAlg = seq(oid("1.2.840.113549.1.1.11"), new byte[]{0x05, 0x00});
        byte[] name = seq(set(seq(oid("2.5.4.3"), tlv(0x0C, cn.getBytes(StandardCharsets.UTF_8)))));
        long now = System.currentTimeMillis();
        byte[] validity = seq(utcTime(new Date(now - 86_400_000L)), utcTime(new Date(2493072000000L))); // 2049-01-01
        byte[] serial = tlv(0x02, new BigInteger(63, new SecureRandom()).add(BigInteger.ONE).toByteArray());
        byte[] version = tlv(0xA0, tlv(0x02, new byte[]{2}));
        byte[] tbs = seq(version, serial, sigAlg, name, validity, name, kp.getPublic().getEncoded());
        Signature s = Signature.getInstance("SHA256withRSA");
        s.initSign((PrivateKey) kp.getPrivate());
        s.update(tbs);
        byte[] sig = s.sign();
        byte[] bitString = new byte[sig.length + 1];
        System.arraycopy(sig, 0, bitString, 1, sig.length);
        byte[] der = seq(tbs, sigAlg, tlv(0x03, bitString));
        return (X509Certificate) CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(der));
    }

    // ---- tiny DER encoder ----

    static byte[] tlv(int tag, byte[] value) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(tag);
        int n = value.length;
        if (n < 128) o.write(n);
        else if (n < 256) { o.write(0x81); o.write(n); }
        else if (n < 65536) { o.write(0x82); o.write(n >> 8); o.write(n & 0xff); }
        else { o.write(0x83); o.write(n >> 16); o.write((n >> 8) & 0xff); o.write(n & 0xff); }
        o.write(value, 0, n);
        return o.toByteArray();
    }

    static byte[] seq(byte[]... parts) {
        return tlv(0x30, concat(parts));
    }

    static byte[] set(byte[]... parts) {
        return tlv(0x31, concat(parts));
    }

    static byte[] oid(String dotted) {
        String[] p = dotted.split("\\.");
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(Integer.parseInt(p[0]) * 40 + Integer.parseInt(p[1]));
        for (int i = 2; i < p.length; i++) {
            long v = Long.parseLong(p[i]);
            byte[] tmp = new byte[10];
            int k = tmp.length;
            tmp[--k] = (byte) (v & 0x7f);
            while ((v >>= 7) > 0) tmp[--k] = (byte) ((v & 0x7f) | 0x80);
            o.write(tmp, k, tmp.length - k);
        }
        return tlv(0x06, o.toByteArray());
    }

    static byte[] utcTime(Date d) {
        SimpleDateFormat f = new SimpleDateFormat("yyMMddHHmmss'Z'", Locale.ROOT);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return tlv(0x17, f.format(d).getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        for (byte[] b : parts) o.write(b, 0, b.length);
        return o.toByteArray();
    }
}
