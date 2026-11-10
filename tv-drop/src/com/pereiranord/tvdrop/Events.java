package com.pereiranord.tvdrop;

import android.util.Log;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Small in-memory log shown on the TV screen and on the web page. */
public final class Events {
    private static final int MAX = 30;
    private static final List<String> LINES = new ArrayList<>();

    private Events() {}

    public static synchronized void add(String msg) {
        Log.i("TVDrop", msg);
        String t = new SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new Date());
        LINES.add(0, t + "  " + msg);
        while (LINES.size() > MAX) LINES.remove(LINES.size() - 1);
    }

    public static synchronized List<String> snapshot() {
        return new ArrayList<>(LINES);
    }
}
