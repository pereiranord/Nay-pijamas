package com.pereiranord.tvdrop;

import android.content.Context;
import android.content.SharedPreferences;

/** KeyValueStore backed by SharedPreferences. */
final class PrefsStore implements KeyValueStore {
    private final SharedPreferences prefs;

    PrefsStore(Context ctx, String name) {
        prefs = ctx.getApplicationContext().getSharedPreferences(name, Context.MODE_PRIVATE);
    }

    @Override
    public String get(String key) {
        return prefs.getString(key, null);
    }

    @Override
    public void put(String key, String value) {
        if (value == null) prefs.edit().remove(key).apply();
        else prefs.edit().putString(key, value).apply();
    }
}
