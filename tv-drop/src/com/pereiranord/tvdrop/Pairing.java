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
 * Who may control this TV. A phone or browser proves it is in the room once, then gets a random token that it
 * sends with every request; the device stays saved (tokens don't expire) until it is removed in Dispositivos.
 * Only a hash of each token is stored.
 *
 * Ways to prove it, in order of preference:
 *  - the code Google's "Android TV Remote Service" shows on the TV (6 characters, 0-9 and A-F). TV Drop asks the
 *    service for a pairing, the person types the code on the phone, and the TV itself checks it. One code does
 *    everything: the device is saved and TV Drop gets full remote control of the TV (see ApiV2 /pair/start).
 *    A wrong code ends that pairing (the next try shows a new code on the TV), and starts are rate limited.
 *  - the QR code on TV Drop's screen (carries a short-lived PIN, nothing to type);
 *  - TV Drop's own 6-digit PIN, only for TVs without Google's service. It is shown on the TV only when a phone
 *    asks for it. PINs rotate every 2 minutes and after 5 wrong tries.
 */
public class Pairing {
    public static final long PIN_TTL_MS = 120_000;
    static final int MAX_FAILURES = 5;
    /** How long the TV keeps a Google pairing open, and how often/many times one may be started. */
    static final long REMOTE_SESSION_MS = 10 * 60_000, REMOTE_MIN_GAP_MS = 3_000, REMOTE_WINDOW_MS = 60 * 60_000;
    static final int REMOTE_MAX_PER_WINDOW = 30;
    private static final String K_DEVICES = "pair.devices";
    private static final String K_LEGACY = "pair.legacyOpen";
    private static final String K_INVITES = "pair.invites";

    public static final class Device {
        public final String id;
        public String name;
        public final long created;
        public long lastSeen;
        final String hash;
        /** "owner" (everything), "guest" (a visitor) or "kids" (a visitor with hours and blocked apps). See Access. */
        String role = ROLE_OWNER;
        /** When this device stops working (0 = never). */
        long expires;
        /** Kids: allowed hours, "HH:MM-HH:MM" (null = any time). */
        String hours;
        /** Kids: apps that don't open. */
        final List<String> blocked = new ArrayList<>();

        Device(String id, String name, String hash, long created, long lastSeen) {
            this.id = id;
            this.name = name;
            this.hash = hash;
            this.created = created;
            this.lastSeen = lastSeen;
        }

        public boolean isOwner() { return ROLE_OWNER.equals(role); }
        public boolean isKids() { return ROLE_KIDS.equals(role); }
        public String role() { return role; }
        boolean inHours(int minute) { return hours == null || Access.within(hours, minute); }

        public JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("id", id).put("name", name).put("created", created).put("lastSeen", lastSeen).put("role", role);
                if (expires > 0) o.put("expires", expires);
                if (hours != null) o.put("hours", hours);
                if (!blocked.isEmpty()) o.put("blocked", new JSONArray(blocked));
            } catch (JSONException ignored) {
            }
            return o;
        }
    }

    public static final String ROLE_OWNER = "owner", ROLE_GUEST = "guest", ROLE_KIDS = "kids";

    /** A one-time link for a visitor's or a child's phone (no Google code needed: the owner vouches for it). */
    public static final class Invite {
        public final String code;
        final String role;
        final long deviceHours;
        final String hours;
        final List<String> blocked;
        final String label;
        public final long expiresAt;

        Invite(String code, String role, long deviceHours, String hours, List<String> blocked, String label, long expiresAt) {
            this.code = code;
            this.role = role;
            this.deviceHours = deviceHours;
            this.hours = hours;
            this.blocked = blocked;
            this.label = label;
            this.expiresAt = expiresAt;
        }

        public JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("code", code).put("role", role).put("deviceHours", deviceHours).put("label", label).put("expiresAt", expiresAt);
                if (hours != null) o.put("hours", hours);
                o.put("blocked", new JSONArray(blocked));
            } catch (JSONException ignored) {
            }
            return o;
        }
    }

    static final long INVITE_TTL_MS = 24 * 3600_000L;
    static final int INVITE_MAX_FAILURES = 10;
    private static final String INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private final List<Invite> invites = new ArrayList<>();
    private int inviteFailures;
    private long inviteLockedUntil;

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
    private long pinShownUntil;
    private String remoteSession;
    private long remoteStarted;
    private final java.util.ArrayDeque<Long> remoteStarts = new java.util.ArrayDeque<>();

    public Pairing(KeyValueStore store) {
        this(store, System::currentTimeMillis, new SecureRandom());
    }

    Pairing(KeyValueStore store, LongSupplier clock, SecureRandom random) {
        this.store = store;
        this.clock = clock;
        this.random = random;
        load();
        loadInvites();
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

    /** A phone without Google's code asks to see the PIN: the TV shows it (fresh) for the next 2 minutes. */
    public synchronized void showPin() {
        rotate();
        pinShownUntil = pinExpires;
    }

    /** Whether TV Drop's screen should show the PIN now (only after a phone asked for it). */
    public synchronized boolean pinVisible() {
        return clock.getAsLong() < pinShownUntil;
    }

    // ---- pairing with Google's code ----

    /** Opens a pairing with the code Google's service shows on the TV. Returns the session id the phone sends back. */
    public synchronized String beginRemote() throws Refused {
        long now = clock.getAsLong();
        while (!remoteStarts.isEmpty() && now - remoteStarts.peekFirst() > REMOTE_WINDOW_MS) remoteStarts.pollFirst();
        if (!remoteStarts.isEmpty() && now - remoteStarts.peekLast() < REMOTE_MIN_GAP_MS) {
            throw new Refused("Aguarde alguns segundos e toque em Conectar de novo.");
        }
        if (remoteStarts.size() >= REMOTE_MAX_PER_WINDOW) {
            throw new Refused("Muitas tentativas de conexão. Espere um pouco antes de tentar de novo.");
        }
        remoteStarts.addLast(now);
        byte[] raw = new byte[12];
        random.nextBytes(raw);
        remoteSession = hex(raw);
        remoteStarted = now;
        return remoteSession;
    }

    /** True when {@code id} is the pairing opened last and it hasn't expired. It can be used once. */
    public synchronized boolean takeRemote(String id) {
        boolean ok = id != null && constantTimeEquals(id, remoteSession) && clock.getAsLong() - remoteStarted < REMOTE_SESSION_MS;
        if (ok) remoteSession = null;
        return ok;
    }

    public synchronized void endRemote() {
        remoteSession = null;
    }

    /** Saves a device that proved it is in the room (Google's code accepted by the TV) and gives it its token. */
    public synchronized Result issue(String deviceName) {
        return newDevice(deviceName);
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
        Result res = newDevice(deviceName);
        pinShownUntil = 0;
        rotate(); // a PIN works once
        return res;
    }

    private Result newDevice(String deviceName) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = hex(raw);
        String hash = sha256(token);
        String name = cleanName(deviceName);
        long now = clock.getAsLong();
        Device d = new Device(hash.substring(0, 10), name, hash, now, now);
        devices.add(d);
        save();
        return new Result(token, d);
    }

    // ---- invites (visitors and children) ----

    /**
     * A link for a visitor's or a child's phone. {@code deviceHours}: how long that phone keeps working (0 = until
     * removed). {@code hours}: kids only, "HH:MM-HH:MM". The invite itself works once, within 24 hours.
     */
    public synchronized Invite invite(String role, long deviceHours, String hours, List<String> blocked, String label) {
        if (!ROLE_GUEST.equals(role) && !ROLE_KIDS.equals(role)) throw new IllegalArgumentException("Tipo de convite inválido");
        if (hours != null && Access.range(hours) == null) throw new IllegalArgumentException("Horário inválido (use 08:00-20:00)");
        purgeInvites();
        StringBuilder c = new StringBuilder();
        for (int i = 0; i < 8; i++) c.append(INVITE_ALPHABET.charAt(random.nextInt(INVITE_ALPHABET.length())));
        Invite inv = new Invite(c.toString(), role, Math.max(0, Math.min(24 * 365, deviceHours)), ROLE_KIDS.equals(role) ? hours : null,
                ROLE_KIDS.equals(role) && blocked != null ? new ArrayList<>(blocked) : new ArrayList<>(),
                cleanName(label == null || label.isEmpty() ? (ROLE_KIDS.equals(role) ? "Criança" : "Visita") : label),
                clock.getAsLong() + INVITE_TTL_MS);
        invites.add(inv);
        saveInvites();
        return inv;
    }

    public synchronized List<Invite> invites() {
        purgeInvites();
        return new ArrayList<>(invites);
    }

    public synchronized boolean cancelInvite(String code) {
        boolean removed = invites.removeIf(i -> i.code.equals(code));
        if (removed) saveInvites();
        return removed;
    }

    /** The visitor's phone opens the link: it gets a token with the invite's limits. The invite then stops working. */
    public synchronized Result redeem(String code, String deviceName) throws Refused {
        long now = clock.getAsLong();
        if (now < inviteLockedUntil) throw new Refused("Muitas tentativas. Espere um minuto.");
        purgeInvites();
        String typed = code == null ? "" : code.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        Invite inv = null;
        for (Invite i : invites) if (constantTimeEquals(i.code, typed)) inv = i;
        if (inv == null) {
            if (++inviteFailures >= INVITE_MAX_FAILURES) { inviteLockedUntil = now + 60_000; inviteFailures = 0; }
            throw new Refused("Convite inválido ou vencido. Peça um novo ao dono da TV.");
        }
        invites.remove(inv);
        saveInvites();
        Result r = newDevice(deviceName == null || deviceName.isEmpty() || "Aparelho".equals(deviceName) ? inv.label : deviceName);
        r.device.role = inv.role;
        r.device.expires = inv.deviceHours > 0 ? now + inv.deviceHours * 3600_000L : 0;
        r.device.hours = inv.hours;
        r.device.blocked.addAll(inv.blocked);
        save();
        return r;
    }

    private void purgeInvites() {
        long now = clock.getAsLong();
        if (invites.removeIf(i -> i.expiresAt <= now)) saveInvites();
    }

    private void saveInvites() {
        JSONArray a = new JSONArray();
        for (Invite i : invites) a.put(i.toJson());
        store.put(K_INVITES, a.toString());
    }

    private void loadInvites() {
        String raw = store.get(K_INVITES);
        if (raw == null) return;
        try {
            JSONArray a = new JSONArray(raw);
            for (int k = 0; k < a.length(); k++) {
                JSONObject o = a.getJSONObject(k);
                List<String> bl = new ArrayList<>();
                JSONArray b = o.optJSONArray("blocked");
                if (b != null) for (int j = 0; j < b.length(); j++) bl.add(b.getString(j));
                invites.add(new Invite(o.getString("code"), o.getString("role"), o.optLong("deviceHours"), o.has("hours") ? o.getString("hours") : null,
                        bl, o.optString("label", "Visita"), o.getLong("expiresAt")));
            }
        } catch (JSONException e) {
            invites.clear();
        }
    }

    /** Returns the paired device for this token, or null. A visitor whose time is up is removed. */
    public synchronized Device check(String token) {
        if (token == null || token.length() < 32) return null;
        String hash = sha256(token);
        for (Device d : devices) {
            if (constantTimeEquals(d.hash, hash)) {
                long now = clock.getAsLong();
                if (d.expires > 0 && now >= d.expires) {
                    devices.remove(d);
                    save();
                    return null;
                }
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
                Device d = new Device(o.getString("id"), o.optString("name", "Aparelho"), o.getString("hash"),
                        o.optLong("created"), o.optLong("lastSeen"));
                d.role = o.optString("role", ROLE_OWNER);
                d.expires = o.optLong("expires");
                d.hours = o.has("hours") ? o.getString("hours") : null;
                JSONArray bl = o.optJSONArray("blocked");
                if (bl != null) for (int j = 0; j < bl.length(); j++) d.blocked.add(bl.getString(j));
                devices.add(d);
            }
        } catch (JSONException e) {
            devices.clear();
        }
    }

    private void save() {
        JSONArray a = new JSONArray();
        try {
            for (Device d : devices) {
                JSONObject o = new JSONObject().put("id", d.id).put("name", d.name).put("hash", d.hash)
                        .put("created", d.created).put("lastSeen", d.lastSeen).put("role", d.role);
                if (d.expires > 0) o.put("expires", d.expires);
                if (d.hours != null) o.put("hours", d.hours);
                if (!d.blocked.isEmpty()) o.put("blocked", new JSONArray(d.blocked));
                a.put(o);
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
