package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.LongSupplier;

/**
 * Lives on the TV: the play queue (keeps going while the phone is elsewhere),
 * saved playlists and the playback history with resume positions.
 * A "src" is a URL (http/https/rtsp) or "inbox:<file name>" for a received file.
 */
public class Library {
    static final int MAX_QUEUE = 500, MAX_HISTORY = 60, MAX_PLAYLISTS = 50;
    /** Resume only when at least this far in and this far from the end. */
    static final long RESUME_MIN_MS = 30_000, RESUME_END_MS = 60_000;
    private static final String K_QUEUE = "lib.queue", K_PLAYLISTS = "lib.playlists", K_HISTORY = "lib.history",
            K_HISTORY_ON = "lib.historyOn";

    public static final class Item {
        public final String src, title;

        public Item(String src, String title) {
            this.src = src;
            this.title = title == null || title.isEmpty() ? titleOf(src) : title;
        }

        JSONObject json() throws JSONException {
            return new JSONObject().put("src", src).put("title", title);
        }

        static Item from(JSONObject o) {
            return new Item(o.optString("src"), o.optString("title"));
        }
    }

    public static final class Entry {
        public final String src;
        public String title;
        public long time, position, duration;
        public boolean favorite;

        Entry(String src, String title) {
            this.src = src;
            this.title = title;
        }

        JSONObject json() throws JSONException {
            return new JSONObject().put("src", src).put("title", title).put("time", time)
                    .put("position", position).put("duration", duration).put("favorite", favorite)
                    .put("resume", resumeFrom(position, duration));
        }
    }

    private final KeyValueStore store;
    private final LongSupplier clock;
    private final List<Item> queue = new ArrayList<>();
    private int current = -1;
    private String repeat = "off"; // off | all | one
    private boolean queueActive;
    private final JSONObject playlists;
    private final List<Entry> history = new ArrayList<>();
    private long lastSave;

    public Library(KeyValueStore store) {
        this(store, System::currentTimeMillis);
    }

    Library(KeyValueStore store, LongSupplier clock) {
        this.store = store;
        this.clock = clock;
        playlists = parseObject(store.get(K_PLAYLISTS));
        loadQueue();
        loadHistory();
    }

    // ---------------------------------------------------------------- queue

    public synchronized JSONObject queueJson() throws JSONException {
        JSONArray a = new JSONArray();
        for (Item i : queue) a.put(i.json());
        return new JSONObject().put("items", a).put("current", current).put("repeat", repeat).put("active", queueActive);
    }

    public synchronized List<Item> queue() {
        return new ArrayList<>(queue);
    }

    public synchronized int current() {
        return current;
    }

    /** mode: "end" (default), "next" (after the current item) or "now" (next, and becomes current). */
    public synchronized int add(Item item, String mode) {
        if (queue.size() >= MAX_QUEUE) throw new IllegalStateException("A fila está cheia (máx. " + MAX_QUEUE + ").");
        int at = queue.size();
        if ("next".equals(mode) || "now".equals(mode)) at = Math.max(0, Math.min(queue.size(), current + 1));
        queue.add(at, item);
        if (at <= current) current++;
        if ("now".equals(mode)) current = at;
        saveQueue();
        return at;
    }

    public synchronized boolean remove(int index) {
        if (index < 0 || index >= queue.size()) return false;
        queue.remove(index);
        if (index < current) current--;
        else if (index == current) current = Math.min(current, queue.size() - 1);
        if (queue.isEmpty()) { current = -1; queueActive = false; }
        saveQueue();
        return true;
    }

    public synchronized boolean move(int from, int to) {
        if (from < 0 || from >= queue.size() || to < 0 || to >= queue.size()) return false;
        Item it = queue.remove(from);
        queue.add(to, it);
        if (current == from) current = to;
        else if (from < current && to >= current) current--;
        else if (from > current && to <= current) current++;
        saveQueue();
        return true;
    }

    public synchronized void clear() {
        queue.clear();
        current = -1;
        queueActive = false;
        saveQueue();
    }

    /** Shuffles the items after the current one (the current item keeps playing). */
    public synchronized void shuffle(java.util.Random rnd) {
        int from = Math.max(0, current + 1);
        if (queue.size() - from < 2) return;
        java.util.List<Item> rest = new ArrayList<>(queue.subList(from, queue.size()));
        java.util.Collections.shuffle(rest, rnd);
        for (int i = 0; i < rest.size(); i++) queue.set(from + i, rest.get(i));
        saveQueue();
    }

    public synchronized void setRepeat(String mode) {
        if (!mode.matches("off|all|one")) throw new IllegalArgumentException("Repetição inválida");
        repeat = mode;
        saveQueue();
    }

    /** Makes item {@code index} current and the queue active. Returns it, or null. */
    public synchronized Item play(int index) {
        if (index < 0 || index >= queue.size()) return null;
        current = index;
        queueActive = true;
        saveQueue();
        return queue.get(index);
    }

    /**
     * Next item, or null at the end. {@code auto} = the previous item finished by itself
     * (then "repeat one" plays it again); a manual "next" always moves on.
     */
    public synchronized Item next(boolean auto) {
        if (queue.isEmpty() || (auto && !queueActive)) return null;
        if (auto && "one".equals(repeat) && current >= 0) return queue.get(current);
        int n = current + 1;
        if (n >= queue.size()) {
            if (!"all".equals(repeat)) {
                if (auto) queueActive = false;
                saveQueue();
                return null;
            }
            n = 0;
        }
        current = n;
        queueActive = true;
        saveQueue();
        return queue.get(n);
    }

    public synchronized Item previous() {
        if (queue.isEmpty()) return null;
        int p = current - 1;
        if (p < 0) p = "all".equals(repeat) ? queue.size() - 1 : 0;
        current = p;
        queueActive = true;
        saveQueue();
        return queue.get(p);
    }

    /** Something outside the queue started playing: the queue stops advancing by itself. */
    public synchronized void setQueueActive(boolean on) {
        queueActive = on && !queue.isEmpty();
    }

    public synchronized boolean queueActive() {
        return queueActive;
    }

    /** Title for a src that is (or was) in the queue. */
    public synchronized String titleFor(String src) {
        for (Item i : queue) if (i.src.equals(src)) return i.title;
        for (Entry e : history) if (e.src.equals(src)) return e.title;
        return titleOf(src);
    }

    // ---------------------------------------------------------------- playlists

    public synchronized JSONObject playlistsJson() throws JSONException {
        JSONArray a = new JSONArray();
        Iterator<String> it = playlists.keys();
        while (it.hasNext()) {
            String name = it.next();
            JSONArray items = playlists.optJSONArray(name);
            a.put(new JSONObject().put("name", name).put("count", items == null ? 0 : items.length()));
        }
        return new JSONObject().put("playlists", a);
    }

    public synchronized void saveQueueAs(String name) throws JSONException {
        String n = Pairing.cleanName(name);
        if (queue.isEmpty()) throw new IllegalStateException("A fila está vazia.");
        if (!playlists.has(n) && playlists.length() >= MAX_PLAYLISTS) throw new IllegalStateException("Limite de playlists atingido.");
        JSONArray a = new JSONArray();
        for (Item i : queue) a.put(i.json());
        playlists.put(n, a);
        store.put(K_PLAYLISTS, playlists.toString());
    }

    /** Replaces the queue with the playlist. */
    public synchronized boolean loadPlaylist(String name) {
        JSONArray a = playlists.optJSONArray(name);
        if (a == null) return false;
        queue.clear();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null) queue.add(Item.from(o));
        }
        current = -1;
        queueActive = false;
        saveQueue();
        return true;
    }

    public synchronized boolean deletePlaylist(String name) {
        if (!playlists.has(name)) return false;
        playlists.remove(name);
        store.put(K_PLAYLISTS, playlists.toString());
        return true;
    }

    // ---------------------------------------------------------------- history

    public synchronized boolean historyEnabled() {
        return !"0".equals(store.get(K_HISTORY_ON));
    }

    public synchronized void setHistoryEnabled(boolean on) {
        store.put(K_HISTORY_ON, on ? null : "0");
        if (!on) clearHistory();
    }

    public synchronized JSONObject historyJson() throws JSONException {
        JSONArray a = new JSONArray();
        for (Entry e : history) a.put(e.json());
        return new JSONObject().put("enabled", historyEnabled()).put("items", a);
    }

    public synchronized void recordStart(String src, String title) {
        if (!historyEnabled() || src == null) return;
        Entry e = find(src);
        if (e == null) e = new Entry(src, title == null ? titleOf(src) : title);
        else history.remove(e);
        if (title != null) e.title = title;
        e.time = clock.getAsLong();
        history.add(0, e);
        while (history.size() > MAX_HISTORY) {
            // keep favourites; drop the oldest ordinary entry
            int drop = -1;
            for (int i = history.size() - 1; i >= 0; i--) if (!history.get(i).favorite) { drop = i; break; }
            history.remove(drop >= 0 ? drop : history.size() - 1);
        }
        saveHistory(true);
    }

    /** Called by the player every few seconds. */
    public synchronized void recordProgress(String src, long position, long duration) {
        if (!historyEnabled()) return;
        Entry e = find(src);
        if (e == null) return;
        e.position = position;
        e.duration = duration;
        saveHistory(false);
    }

    public synchronized long resumePosition(String src) {
        Entry e = find(src);
        return e == null ? 0 : resumeFrom(e.position, e.duration);
    }

    public synchronized boolean toggleFavorite(String src) {
        Entry e = find(src);
        if (e == null) return false;
        e.favorite = !e.favorite;
        saveHistory(true);
        return e.favorite;
    }

    public synchronized void clearHistory() {
        history.clear();
        saveHistory(true);
    }

    static long resumeFrom(long position, long duration) {
        if (position < RESUME_MIN_MS) return 0;
        if (duration > 0 && position > duration - RESUME_END_MS) return 0;
        return position;
    }

    private Entry find(String src) {
        for (Entry e : history) if (e.src.equals(src)) return e;
        return null;
    }

    // ---------------------------------------------------------------- storage

    private void saveQueue() {
        try {
            store.put(K_QUEUE, queueJson().toString());
        } catch (JSONException ignored) {
        }
    }

    private void loadQueue() {
        JSONObject o = parseObject(store.get(K_QUEUE));
        JSONArray a = o.optJSONArray("items");
        if (a != null) for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            if (it != null) queue.add(Item.from(it));
        }
        current = Math.min(o.optInt("current", -1), queue.size() - 1);
        repeat = o.optString("repeat", "off");
        queueActive = false; // never resume playing by itself after a restart
    }

    private void saveHistory(boolean force) {
        long now = clock.getAsLong();
        if (!force && now - lastSave < 15_000) return;
        lastSave = now;
        JSONArray a = new JSONArray();
        try {
            for (Entry e : history) a.put(e.json());
        } catch (JSONException ignored) {
        }
        store.put(K_HISTORY, a.toString());
    }

    private void loadHistory() {
        try {
            String raw = store.get(K_HISTORY);
            if (raw == null) return;
            JSONArray a = new JSONArray(raw);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                Entry e = new Entry(o.getString("src"), o.optString("title"));
                e.time = o.optLong("time");
                e.position = o.optLong("position");
                e.duration = o.optLong("duration");
                e.favorite = o.optBoolean("favorite");
                history.add(e);
            }
        } catch (JSONException e) {
            history.clear();
        }
    }

    private static JSONObject parseObject(String s) {
        if (s == null) return new JSONObject();
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** "inbox:Filme.mkv" -> "Filme.mkv"; ".../video%20x.mp4?a=1" -> "video x.mp4". */
    static String titleOf(String src) {
        if (src == null) return "";
        if (src.startsWith("inbox:")) return src.substring(6);
        String s = src;
        int q = s.indexOf('?');
        if (q > 0) s = s.substring(0, q);
        int slash = s.lastIndexOf('/');
        if (slash >= 0 && slash < s.length() - 1) s = s.substring(slash + 1);
        try {
            s = java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception ignored) {
        }
        return s.length() > 80 ? s.substring(0, 77) + "..." : s;
    }
}
