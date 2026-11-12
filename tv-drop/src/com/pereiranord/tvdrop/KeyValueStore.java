package com.pereiranord.tvdrop;

import java.util.HashMap;
import java.util.Map;

/** Small persistent string store (SharedPreferences on Android, a map in tests). */
public interface KeyValueStore {
    String get(String key);

    void put(String key, String value);

    /** In-memory store for tests. */
    final class Memory implements KeyValueStore {
        private final Map<String, String> map = new HashMap<>();

        @Override
        public synchronized String get(String key) {
            return map.get(key);
        }

        @Override
        public synchronized void put(String key, String value) {
            if (value == null) map.remove(key);
            else map.put(key, value);
        }
    }
}
