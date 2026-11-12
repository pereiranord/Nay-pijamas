package com.pereiranord.tvdrop;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * Party games room. The game itself runs in the TV's game page (the "host");
 * phones are the controllers ("players"). This hub only relays text messages:
 *
 *   player -> host   {"t":"m","id":"<player>","d":<what the phone sent>}
 *   host -> player   the host sends "<player id>|<json>" or "*|<json>" (everyone)
 *   hub -> host      {"t":"room",...}  {"t":"join","id"}  {"t":"leave","id"}
 *   host -> hub      "!kick|<player id>" removes that player (the phone gets {"t":"kicked"})
 *   player -> hub    {"t":"p"} pulse, answered right away with {"t":"pong"}; at most 60 messages/s per phone
 *   hub -> player    {"t":"host","on":bool}  {"t":"closed"}  {"t":"full"}  {"t":"noroom"}  {"t":"kicked"}
 *
 * Players join with the 4-digit room code shown on the TV. They are guests:
 * the room gives no access to the rest of TV Drop (no pairing, no remote control).
 */
final class GameHub {
    static final int MAX_PLAYERS = 10; // 6 play, the rest wait for the next match
    private static final int MAX_MESSAGE = 24_000;
    static final int RATE = 60, BURST = 120;
    volatile long dropped; // messages refused by the rate limit (for tests and diagnostics)
    private static final String DIGITS = "0123456789";
    private static final String POISON = new String("close");
    private final SecureRandom rnd = new SecureRandom();
    private String code, hostKey;
    private Peer host;
    private final Map<String, Peer> players = new LinkedHashMap<>();

    /** One connection with its own writer thread, so a slow phone never blocks the game. */
    static final class Peer {
        final String id;
        final Http.WebSocket ws;
        private final LinkedBlockingQueue<String> queue = new LinkedBlockingQueue<>(3000);

        Peer(String id, Http.WebSocket ws) {
            this.id = id;
            this.ws = ws;
            Thread t = new Thread(() -> {
                try {
                    while (true) {
                        String m = queue.take();
                        if (m == POISON) break;
                        ws.sendText(m);
                    }
                } catch (Exception ignored) {
                }
                ws.close();
            }, "tvdrop-game-out");
            t.setDaemon(true);
            t.start();
        }

        void send(String m) {
            if (!queue.offer(m)) { // a phone that stopped reading: drop it instead of holding the game back
                queue.clear();
                queue.offer(POISON);
            }
        }

        /** Sends what is still queued (a goodbye, for instance) and then drops the connection. */
        void close() {
            if (!queue.offer(POISON)) {
                queue.clear();
                queue.offer(POISON);
            }
        }
    }

    /** Opens a room (or returns the one already open). */
    synchronized String open() {
        if (code == null) {
            StringBuilder sb = new StringBuilder();
            sb.append("123456789".charAt(rnd.nextInt(9))); // 4 digits, never starting with 0
            for (int i = 1; i < 4; i++) sb.append(DIGITS.charAt(rnd.nextInt(DIGITS.length())));
            code = sb.toString();
            byte[] k = new byte[18];
            rnd.nextBytes(k);
            StringBuilder hex = new StringBuilder();
            for (byte b : k) hex.append(String.format("%02x", b));
            hostKey = hex.toString();
            Events.add("Sala de jogos aberta: " + code);
        }
        return code;
    }

    synchronized void close() {
        if (code == null) return;
        for (Peer p : players.values()) {
            p.send("{\"t\":\"closed\"}");
            p.close();
        }
        players.clear();
        if (host != null) host.close();
        host = null;
        code = null;
        hostKey = null;
        Events.add("Sala de jogos encerrada");
    }

    synchronized boolean isOpen() { return code != null; }
    synchronized String code() { return code; }
    synchronized String hostKey() { return hostKey; }
    synchronized int playerCount() { return players.size(); }
    synchronized boolean hostConnected() { return host != null; }

    synchronized boolean isHostKey(String key) {
        return hostKey != null && key != null && java.security.MessageDigest.isEqual(hostKey.getBytes(), key.getBytes());
    }

    /** Runs the host connection until it closes. {@code joinUrl} is what phones should open. */
    void serveHost(Http.WebSocket ws, String joinUrl) throws IOException {
        Peer me = new Peer("host", ws);
        synchronized (this) {
            if (host != null) host.close();
            host = me;
            me.send("{\"t\":\"room\",\"code\":" + Http.js(code) + ",\"url\":" + Http.js(joinUrl) + "}");
            for (Peer p : players.values()) {
                me.send("{\"t\":\"join\",\"id\":" + Http.js(p.id) + "}");
                p.send("{\"t\":\"host\",\"on\":true}");
            }
        }
        try {
            String msg;
            while ((msg = ws.receive()) != null) {
                int bar = msg.indexOf('|');
                if (bar <= 0) continue; // keep-alive
                String to = msg.substring(0, bar), data = msg.substring(bar + 1);
                synchronized (this) {
                    if (host != me) break;
                    if ("!kick".equals(to)) { // the host removes a player from the room
                        Peer p = players.remove(data);
                        if (p != null) {
                            p.send("{\"t\":\"kicked\"}");
                            p.close();
                            me.send("{\"t\":\"leave\",\"id\":" + Http.js(data) + ",\"kicked\":true}");
                        }
                        continue;
                    }
                    if ("*".equals(to)) for (Peer p : players.values()) p.send(data);
                    else {
                        Peer p = players.get(to);
                        if (p != null) p.send(data);
                    }
                }
            }
        } finally {
            synchronized (this) {
                if (host == me) {
                    host = null;
                    for (Peer p : players.values()) p.send("{\"t\":\"host\",\"on\":false}");
                }
            }
            me.close();
        }
    }

    /** Runs one phone's connection until it closes. */
    void servePlayer(Http.WebSocket ws, String room, String id) throws IOException {
        Peer me;
        String refusal = null;
        synchronized (this) {
            if (code == null || room == null || !code.equalsIgnoreCase(room.trim())) refusal = "{\"t\":\"noroom\"}";
            else if (!players.containsKey(id) && players.size() >= MAX_PLAYERS) refusal = "{\"t\":\"full\"}";
            if (refusal == null) {
                Peer old = players.remove(id);
                if (old != null) old.close(); // the same phone reconnecting
                me = new Peer(id, ws);
                players.put(id, me);
                me.send("{\"t\":\"host\",\"on\":" + (host != null) + "}");
                if (host != null) host.send("{\"t\":\"join\",\"id\":" + Http.js(id) + "}");
            } else me = null;
        }
        if (me == null) { // said on this thread, so it is delivered before the connection goes away
            ws.sendText(refusal);
            ws.close();
            return;
        }
        try {
            String msg;
            double tokens = BURST;
            long last = System.nanoTime();
            while ((msg = ws.receive()) != null) {
                if (msg.startsWith("{\"t\":\"p\"")) { me.send("{\"t\":\"pong\"}"); continue; } // pulse: answered here, the TV page isn't bothered
                if (msg.length() < 10 || msg.length() > MAX_MESSAGE || msg.charAt(0) != '{') continue; // keep-alive or junk
                // at most RATE messages per second per phone (bursts up to BURST): a broken or hostile page can't flood the TV
                long t = System.nanoTime();
                tokens = Math.min(BURST, tokens + (t - last) / 1e9 * RATE);
                last = t;
                if (tokens < 1) { dropped++; continue; }
                tokens -= 1;
                synchronized (this) {
                    if (players.get(id) != me) break;
                    if (host != null) host.send("{\"t\":\"m\",\"id\":" + Http.js(id) + ",\"d\":" + msg + "}");
                }
            }
        } finally {
            synchronized (this) {
                if (players.get(id) == me) {
                    players.remove(id);
                    if (host != null) host.send("{\"t\":\"leave\",\"id\":" + Http.js(id) + "}");
                }
            }
            me.close();
        }
    }

    synchronized List<String> playerIds() {
        return new ArrayList<>(players.keySet());
    }
}
