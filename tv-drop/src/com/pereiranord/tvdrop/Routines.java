package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.function.LongSupplier;

/**
 * Routines live and run on the TV, so they work with every phone off: a button ("Boa noite": volume down and turn
 * off in 30 minutes) and, optionally, a time of day ("desligar às 23:30 de domingo a quinta").
 *
 * A routine: {"id","name","time":"HH:MM" or null,"days":[1..7] (Calendar.SUNDAY=1; empty = every day),
 * "enabled":bool,"actions":[...]}. Actions: {"type":"key","key","times"}, {"type":"volume","dir":"up|down","steps"},
 * {"type":"app","pkg"}, {"type":"link","url"}, {"type":"text","text"}, {"type":"search","query"},
 * {"type":"timer","minutes","action"}, {"type":"power","state":"on|off"}, {"type":"wait","seconds"}.
 */
final class Routines {
    /** What the TV does for each action. Each returns null on success or why it couldn't. */
    interface Actions {
        String key(String key);
        String app(String pkg);
        String link(String url);
        String text(String text);
        String search(String query);
        String volume(String dir);
        String timer(long minutes, String action);
        String power(boolean on);
    }

    interface Sleeper {
        void sleep(long ms) throws InterruptedException;
    }

    static final int MAX_ROUTINES = 30, MAX_ACTIONS = 20;
    private static final String K = "routines";
    private final KeyValueStore store;
    private final LongSupplier clock;
    private final List<JSONObject> list = new ArrayList<>();
    /** "id@yyyymmddhhmm" of the last scheduled run, so a routine runs once in its minute. */
    private final java.util.Map<String, String> ranAt = new java.util.HashMap<>();

    Routines(KeyValueStore store, LongSupplier clock) {
        this.store = store;
        this.clock = clock;
        String raw = store.get(K);
        try {
            if (raw != null) {
                JSONArray a = new JSONArray(raw);
                for (int i = 0; i < a.length(); i++) list.add(a.getJSONObject(i));
            } else {
                presets();
            }
        } catch (JSONException e) {
            list.clear();
        }
    }

    private void presets() throws JSONException {
        list.add(new JSONObject().put("id", "boanoite").put("name", "Boa noite").put("icon", "timer").put("enabled", true)
                .put("time", JSONObject.NULL).put("days", new JSONArray())
                .put("actions", new JSONArray()
                        .put(new JSONObject().put("type", "volume").put("dir", "down").put("steps", 5))
                        .put(new JSONObject().put("type", "timer").put("minutes", 30).put("action", "power"))));
        list.add(new JSONObject().put("id", "desligar2330").put("name", "Desligar às 23:30").put("icon", "power").put("enabled", false)
                .put("time", "23:30").put("days", new JSONArray())
                .put("actions", new JSONArray().put(new JSONObject().put("type", "power").put("state", "off"))));
        list.add(new JSONObject().put("id", "bomdia").put("name", "Bom dia").put("icon", "home").put("enabled", false)
                .put("time", "07:00").put("days", new JSONArray().put(2).put(3).put(4).put(5).put(6))
                .put("actions", new JSONArray()
                        .put(new JSONObject().put("type", "power").put("state", "on"))
                        .put(new JSONObject().put("type", "wait").put("seconds", 8))
                        .put(new JSONObject().put("type", "link").put("url", "https://www.youtube.com"))));
        persist();
    }

    synchronized JSONArray toJson() {
        JSONArray a = new JSONArray();
        for (JSONObject o : list) a.put(o);
        return a;
    }

    synchronized JSONObject get(String idOrName) {
        if (idOrName == null) return null;
        for (JSONObject o : list) if (o.optString("id").equals(idOrName)) return o;
        String n = idOrName.trim().toLowerCase(Locale.ROOT);
        for (JSONObject o : list) if (o.optString("name").trim().toLowerCase(Locale.ROOT).equals(n)) return o;
        return null;
    }

    /** Adds or replaces a routine after checking it. Returns the saved routine. */
    synchronized JSONObject save(JSONObject in) throws JSONException {
        JSONObject r = check(in);
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).optString("id").equals(r.getString("id"))) {
                list.set(i, r);
                persist();
                return r;
            }
        }
        if (list.size() >= MAX_ROUTINES) throw new IllegalArgumentException("Limite de " + MAX_ROUTINES + " rotinas");
        list.add(r);
        persist();
        return r;
    }

    synchronized boolean delete(String id) {
        boolean removed = list.removeIf(o -> o.optString("id").equals(id));
        if (removed) persist();
        return removed;
    }

    /** Routines whose time is now (this minute), each once. */
    synchronized List<JSONObject> due() {
        long now = clock.getAsLong();
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        String hhmm = String.format(Locale.ROOT, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
        String stamp = String.format(Locale.ROOT, "%tY%<tm%<td%s", c, hhmm);
        int day = c.get(Calendar.DAY_OF_WEEK);
        List<JSONObject> out = new ArrayList<>();
        for (JSONObject o : list) {
            if (!o.optBoolean("enabled") || !hhmm.equals(o.optString("time", ""))) continue;
            JSONArray days = o.optJSONArray("days");
            if (days != null && days.length() > 0) {
                boolean ok = false;
                for (int i = 0; i < days.length(); i++) if (days.optInt(i) == day) ok = true;
                if (!ok) continue;
            }
            String id = o.optString("id");
            if (stamp.equals(ranAt.get(id))) continue;
            ranAt.put(id, stamp);
            out.add(o);
        }
        return out;
    }

    /** Runs the actions in order. Returns the problems (empty when all went well); a failed step doesn't stop the rest. */
    static List<String> run(JSONObject routine, Actions a, Sleeper sleeper) {
        List<String> problems = new ArrayList<>();
        JSONArray acts = routine.optJSONArray("actions");
        if (acts == null) return problems;
        for (int i = 0; i < acts.length(); i++) {
            JSONObject x = acts.optJSONObject(i);
            if (x == null) continue;
            String err;
            try {
                switch (x.optString("type")) {
                    case "key": {
                        err = null;
                        int times = Math.max(1, Math.min(20, x.optInt("times", 1)));
                        for (int t = 0; t < times && err == null; t++) {
                            err = a.key(x.optString("key"));
                            if (times > 1) sleeper.sleep(150);
                        }
                        break;
                    }
                    case "volume": {
                        err = null;
                        int steps = Math.max(1, Math.min(30, x.optInt("steps", 1)));
                        for (int t = 0; t < steps && err == null; t++) {
                            err = a.volume("down".equals(x.optString("dir")) ? "down" : "up");
                            sleeper.sleep(120);
                        }
                        break;
                    }
                    case "app": err = a.app(x.optString("pkg")); break;
                    case "link": err = a.link(x.optString("url")); break;
                    case "text": err = a.text(x.optString("text")); break;
                    case "search": err = a.search(x.optString("query")); break;
                    case "timer": err = a.timer(x.optLong("minutes"), x.optString("action", "power")); break;
                    case "power": err = a.power(!"off".equals(x.optString("state"))); break;
                    case "wait": sleeper.sleep(Math.max(0, Math.min(60, x.optInt("seconds", 1))) * 1000L); err = null; break;
                    default: err = "ação desconhecida";
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                problems.add("interrompida");
                break;
            } catch (RuntimeException e) {
                err = e.getMessage();
            }
            if (err != null) problems.add((i + 1) + ". " + x.optString("type") + ": " + err);
        }
        return problems;
    }

    private JSONObject check(JSONObject in) throws JSONException {
        String name = Pairing.cleanName(in.optString("name", ""));
        if (name.equals("Aparelho") && in.optString("name", "").trim().isEmpty()) throw new IllegalArgumentException("Dê um nome à rotina");
        String id = in.optString("id", "");
        if (!id.matches("[a-z0-9_-]{1,32}")) id = "r" + Long.toString(clock.getAsLong(), 36);
        Object time = in.opt("time");
        String t = time instanceof String && !((String) time).isEmpty() ? (String) time : null;
        if (t != null && !t.matches("([01]\\d|2[0-3]):[0-5]\\d")) throw new IllegalArgumentException("Horário inválido (use 23:30)");
        JSONArray days = new JSONArray();
        JSONArray inDays = in.optJSONArray("days");
        if (inDays != null) for (int i = 0; i < inDays.length(); i++) { int d = inDays.optInt(i); if (d >= 1 && d <= 7) days.put(d); }
        JSONArray acts = in.optJSONArray("actions");
        if (acts == null || acts.length() == 0) throw new IllegalArgumentException("A rotina precisa de pelo menos uma ação");
        if (acts.length() > MAX_ACTIONS) throw new IllegalArgumentException("No máximo " + MAX_ACTIONS + " ações");
        JSONArray clean = new JSONArray();
        for (int i = 0; i < acts.length(); i++) {
            JSONObject x = acts.getJSONObject(i);
            String type = x.optString("type");
            if (!type.matches("key|volume|app|link|text|search|timer|power|wait")) throw new IllegalArgumentException("Ação desconhecida: " + type);
            if (type.equals("key") && Keys.get(x.optString("key")) == null) throw new IllegalArgumentException("Tecla desconhecida: " + x.optString("key"));
            if (type.equals("link") && !x.optString("url").matches("(?i)^(https?|[a-z][a-z0-9+.-]*)://\\S+$")) throw new IllegalArgumentException("Link inválido");
            if (type.equals("timer") && (x.optLong("minutes") < 1 || x.optLong("minutes") > SleepTimer.MAX_MINUTES)) throw new IllegalArgumentException("Minutos do temporizador inválidos");
            clean.put(x);
        }
        return new JSONObject().put("id", id).put("name", name).put("icon", in.optString("icon", "bolt"))
                .put("enabled", in.optBoolean("enabled", true)).put("time", t == null ? JSONObject.NULL : t)
                .put("days", days).put("actions", clean);
    }

    private void persist() {
        store.put(K, toJson().toString());
    }
}
