package com.pereiranord.tvdrop;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * Holding a key on the phone = a continuous action on the TV. The phone only says
 * "pressed" and "released"; the repeating happens here, on the TV, at a steady pace,
 * so Wi-Fi hiccups don't make the movement choppy.
 *
 * A held key stops by itself when released, when its connection closes, or after
 * {@link #MAX_HOLD_MS} as a safety net (a lost "released" message must never leave
 * the TV scrolling forever).
 */
public class KeyRepeater {
    static final long FIRST_DELAY_MS = 350, MAX_HOLD_MS = 15_000;
    private final ScheduledExecutorService exec;
    /** Sends one key press; returns null on success or an error message. */
    private final Function<String, String> press;
    private final Map<String, Hold> holds = new HashMap<>();
    private long maxHoldMs = MAX_HOLD_MS;

    private static final class Hold {
        ScheduledFuture<?> repeat, safety;
    }

    public KeyRepeater(ScheduledExecutorService exec, Function<String, String> press) {
        this.exec = exec;
        this.press = press;
    }

    /** Tests shorten the safety limit. */
    KeyRepeater maxHold(long ms) {
        maxHoldMs = ms;
        return this;
    }

    /** Milliseconds between repeats: fast for moving around, calmer for volume and channels. */
    static long interval(String key) {
        switch (key) {
            case "volup": case "voldown": return 160;
            case "chup": case "chdown": return 450;
            case "del": return 90;
            case "ff": case "rew": return 300;
            default: return 110;
        }
    }

    /** Key down: one press now, then repeats until {@link #stop}. {@code owner} identifies the connection. */
    public synchronized String start(String owner, String key) {
        stop(owner, key);
        String err = press.apply(key);
        if (err != null) return err;
        Hold h = new Hold();
        String id = owner + "|" + key;
        long every = interval(key);
        // fixed delay (not rate): a slow press never causes a burst of catch-up presses
        h.repeat = exec.scheduleWithFixedDelay(() -> {
            if (press.apply(key) != null) stop(owner, key);
        }, FIRST_DELAY_MS, every, TimeUnit.MILLISECONDS);
        h.safety = exec.schedule(() -> stop(owner, key), maxHoldMs, TimeUnit.MILLISECONDS);
        holds.put(id, h);
        return null;
    }

    /** Key up. */
    public synchronized void stop(String owner, String key) {
        Hold h = holds.remove(owner + "|" + key);
        if (h == null) return;
        h.repeat.cancel(false);
        h.safety.cancel(false);
    }

    /** The connection went away: release everything it was holding. */
    public synchronized void stopAll(String owner) {
        for (String id : holds.keySet().toArray(new String[0])) {
            if (id.startsWith(owner + "|")) stop(owner, id.substring(owner.length() + 1));
        }
    }

    public synchronized int held() {
        return holds.size();
    }
}
