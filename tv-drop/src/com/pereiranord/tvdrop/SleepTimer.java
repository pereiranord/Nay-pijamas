package com.pereiranord.tvdrop;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/**
 * Sleep timer running on the TV, so it fires even if the phone is off.
 * Actions: "pause", "mute", "stop" (end playback) or "power" (turn the TV off,
 * only when the remote is paired; otherwise it falls back to "stop").
 */
public class SleepTimer {
    public static final long MAX_MINUTES = 12 * 60;
    private final ScheduledExecutorService exec;
    private final LongSupplier clock;
    private final Consumer<String> action;
    private ScheduledFuture<?> task;
    private String pending;
    private long endsAt;

    public SleepTimer(ScheduledExecutorService exec, LongSupplier clock, Consumer<String> action) {
        this.exec = exec;
        this.clock = clock;
        this.action = action;
    }

    public synchronized void set(long minutes, String what) {
        if (minutes < 1 || minutes > MAX_MINUTES) throw new IllegalArgumentException("Escolha de 1 a " + MAX_MINUTES + " minutos.");
        if (!what.matches("pause|mute|stop|power")) throw new IllegalArgumentException("Ação do temporizador inválida.");
        cancel();
        pending = what;
        endsAt = clock.getAsLong() + minutes * 60_000;
        task = exec.schedule(this::fire, minutes * 60_000, TimeUnit.MILLISECONDS);
    }

    public synchronized boolean cancel() {
        boolean had = task != null;
        if (task != null) task.cancel(false);
        task = null;
        pending = null;
        endsAt = 0;
        return had;
    }

    private void fire() {
        String what;
        synchronized (this) {
            what = pending;
            task = null;
            pending = null;
            endsAt = 0;
        }
        if (what != null) action.accept(what);
    }

    public synchronized JSONObject state() throws JSONException {
        boolean on = task != null;
        return new JSONObject().put("active", on).put("action", on ? pending : JSONObject.NULL)
                .put("endsAt", endsAt).put("remainingMs", on ? Math.max(0, endsAt - clock.getAsLong()) : 0);
    }
}
