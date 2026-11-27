package com.pereiranord.tvdrop;

import java.util.ArrayList;
import java.util.List;

/**
 * Turning the TV off (or on) and checking that it really happened. A key sent to the TV's remote service can be
 * accepted and still do nothing (some TVs ignore POWER from the network), so each way is tried in turn and, after
 * each one, the TV is asked whether its screen is still on. The first way that works wins; when none does, the
 * phone hears why instead of a silent "OK".
 */
final class PowerSwitch {
    /** One way of sending the command: returns null when it was sent, or why it couldn't be. */
    interface Attempt {
        String run() throws Exception;
    }

    interface Check {
        boolean done();
    }

    interface Sleeper {
        void sleep(long ms) throws InterruptedException;
    }

    static final class Step {
        final String name;
        final Attempt attempt;

        Step(String name, Attempt attempt) {
            this.name = name;
            this.attempt = attempt;
        }
    }

    static final class Result {
        /** Null when the TV changed state. */
        final String error;
        /** The way that worked (null when none did). */
        final String via;
        /** Every way that was sent, in order. */
        final List<String> sent;

        Result(String error, String via, List<String> sent) {
            this.error = error;
            this.via = via;
            this.sent = sent;
        }
    }

    static final long POLL_MS = 150;

    private PowerSwitch() {}

    /**
     * Tries the steps in order until {@code done} says the TV changed state, waiting up to {@code waitMs} after each
     * one that was sent. {@code noWay}: the message when none could even be sent; {@code noEffect}: when some were
     * sent and the TV stayed as it was.
     */
    static Result run(List<Step> steps, Check done, long waitMs, Sleeper sleeper, String noWay, String noEffect) {
        List<String> sent = new ArrayList<>();
        StringBuilder errors = new StringBuilder();
        for (Step s : steps) {
            String err;
            try {
                err = s.attempt.run();
            } catch (Exception e) {
                err = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            }
            if (err != null) {
                if (errors.length() > 0) errors.append("; ");
                errors.append(s.name).append(": ").append(err);
                continue;
            }
            sent.add(s.name);
            try {
                for (long t = 0; t < waitMs; t += POLL_MS) {
                    if (done.done()) return new Result(null, s.name, sent);
                    sleeper.sleep(POLL_MS);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            if (done.done()) return new Result(null, s.name, sent);
        }
        if (sent.isEmpty()) return new Result(errors.length() > 0 ? noWay + " (" + errors + ")" : noWay, null, sent);
        return new Result(noEffect, null, sent);
    }
}
