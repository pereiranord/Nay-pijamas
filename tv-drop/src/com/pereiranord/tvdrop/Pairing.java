package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.LongSupplier;

/**
 * Who may control this TV. A phone or browser proves it is in the room by typing
 * the 6-digit PIN shown on the TV (or scanning the QR code, which carries the
 * same short-lived PIN). It then gets a random token that it sends with every
 * request. Only a hash of each token is stored. PINs rotate every 2 minutes and
 * after 5 wrong tries, so guessing is not practical.
 */
public class Pairing {
    public static final long PIN_TTL_MS = 120_000;
    static final int MAX_FAILURES = 5;
    private static final String K_DEVICES = "pair.devices";
    private static final String K_LEGACY = "pair.legacyOpen";

    public static final class Device {
        public final String id;
        public String name;
        public final long created;
        public long lastSeen;
        final String hash;

        Device(String id, String name, String hash, long created, long lastSeen) {
            this.id = id;
            this.name = name;
            this.hash = hash;
            this.created = created;
            this.lastSeen = lastSeen;
        }

        public JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("id", id).put("name", name).put("created", created).put("lastSeen", lastSeen);
            } catch (JSONException ignored) {
            }
            return o;
        }
    }

    /** Thrown when pairing is refused; the message is shown to the user. */
    public static final class Refused extends Exception {
        public Refused(String msg) {
            super(msg);
        }
    }

    public static final class Result {
        public final String token;
        public final Device device;

        Result(String token, Device device) {
            this.token = token;
            this.device = device;
        }
    }

    private final KeyValueStore store;
    private final LongSupplier clock;
    private final SecureRandom random;
    private final List<Device> devices = new ArrayList<>();
    private String pin;
    private long pinExpires;
    private int failures;

    public Pairing(KeyValueStore store) {
        this(store, System::currentTimeMillis, new SecureRandom());
    }

    Pairing(KeyValueStore store, LongSupplier clock, SecureRandom random) {
        this.store = store;
        this.clock = clock;
        this.random = random;
        load();
    }

    // ---- PIN ----

    public synchronized String pin() {
        if (pin == null || clock.getAsLong() >= pinExpires) rotate();
        return pin;
    }

    public synchronized long pinExpiresAt() {
        pin();
        return pinExpires;
    }

    private void rotate() {
        pin = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        pinExpires = clock.getAsLong() + PIN_TTL_MS;
        failures = 0;
    }

    /** Exchanges the PIN shown on the TV for a token. */
    public synchronized Result pair(String typedPin, String deviceName) throws Refused {
        String current = pin();
        String typed = typedPin == null ? "" : typedPin.replaceAll("\\D", "");
        if (!constantTimeEquals(typed, current)) {
            failures++;
            if (failures >= MAX_FAILURES) {
                rotate();
                throw new Refused("Muitas tentativas erradas. A TV mostrou um código novo.");
            }
            throw new Refused("Código incorreto. Confira o código de 6 números na tela da TV.");
        }
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = hex(raw);
        String hash = sha256(token);
        String name = cleanName(deviceName);
        long now = clock.getAsLong();
        Device d = new Device(hash.substring(0, 10), name, hash, now, now);
        devices.add(d);
        save();
        rotate(); // a PIN works once
        return new Result(token, d);
    }

    /** Returns the paired device for this token, or null. */
    public synchronized Device check(String token) {
        if (token == null || token.length() < 32) return null;
        String hash = sha256(token);
        for (Device d : devices) {
            if (constantTimeEquals(d.hash, hash)) {
                long now = clock.getAsLong();
                if (now - d.lastSeen > 60_000) {
                    d.lastSeen = now;
                    save();
                }
                return d;
            }
        }
        return null;
    }

    public synchronized List<Device> devices() {
        return new ArrayList<>(devices);
    }

    public synchronized boolean revoke(String id) {
        boolean removed = devices.removeIf(d -> d.id.equals(id));
        if (removed) save();
        return removed;
    }

    public synchronized boolean rename(String id, String name) {
        for (Device d : devices) {
            if (d.id.equals(id)) {
                d.name = cleanName(name);
                save();
                return true;
            }
        }
        return false;
    }

    /** When on, the original /api/* routes also answer unpaired clients (TV Drop 1.0.x apps). */
    public synchronized boolean legacyOpen() {
        return "1".equals(store.get(K_LEGACY));
    }

    public synchronized void setLegacyOpen(boolean open) {
        store.put(K_LEGACY, open ? "1" : null);
    }

    // ---- storage ----

    private void load() {
        String raw = store.get(K_DEVICES);
        if (raw == null) return;
        try {
            JSONArray a = new JSONArray(raw);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                devices.add(new Device(o.getString("id"), o.optString("name", "Aparelho"), o.getString("hash"),
                        o.optLong("created"), o.optLong("lastSeen")));
            }
        } catch (JSONException e) {
            devices.clear();
        }
    }

    private void save() {
        JSONArray a = new JSONArray();
        try {
            for (Device d : devices) {
                a.put(new JSONObject().put("id", d.id).put("name", d.name).put("hash", d.hash)
                        .put("created", d.created).put("lastSeen", d.lastSeen));
            }
        } catch (JSONException ignored) {
        }
        store.put(K_DEVICES, a.toString());
    }

    // ---- helpers ----

    static String cleanName(String s) {
        if (s == null) return "Aparelho";
        String n = s.replaceAll("[\\p{Cntrl}<>]", "").trim();
        if (n.isEmpty()) return "Aparelho";
        return n.length() > 40 ? n.substring(0, 40) : n;
    }

    static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    static String sha256(String s) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }
}
