package com.pereiranord.tvdrop;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Remote-control commands by name. Each knows the Android key code (sent through
 * the Android TV Remote protocol), the accessibility global action that can stand
 * in for it, and whether it is a media key the system can route by itself.
 */
public final class Keys {
    /** Accessibility global actions (AccessibilityService.GLOBAL_ACTION_*). */
    static final int GA_NONE = 0, GA_BACK = 1, GA_HOME = 2, GA_RECENTS = 3, GA_NOTIFICATIONS = 4,
            GA_DPAD_UP = 16, GA_DPAD_DOWN = 17, GA_DPAD_LEFT = 18, GA_DPAD_RIGHT = 19, GA_DPAD_CENTER = 20;

    public static final class Key {
        public final String name;
        public final int keyCode;
        public final int globalAction;
        /** Minimum Android SDK for the global action (D-pad actions arrived in Android 13 / SDK 33). */
        public final int globalActionSdk;
        public final boolean media;

        Key(String name, int keyCode, int globalAction, int globalActionSdk, boolean media) {
            this.name = name;
            this.keyCode = keyCode;
            this.globalAction = globalAction;
            this.globalActionSdk = globalActionSdk;
            this.media = media;
        }
    }

    private static final Map<String, Key> ALL = new LinkedHashMap<>();

    private static void add(String name, int keyCode, int ga, int gaSdk, boolean media) {
        ALL.put(name, new Key(name, keyCode, ga, gaSdk, media));
    }

    static {
        add("up", 19, GA_DPAD_UP, 33, false);
        add("down", 20, GA_DPAD_DOWN, 33, false);
        add("left", 21, GA_DPAD_LEFT, 33, false);
        add("right", 22, GA_DPAD_RIGHT, 33, false);
        add("ok", 23, GA_DPAD_CENTER, 33, false);
        add("back", 4, GA_BACK, 16, false);
        add("home", 3, GA_HOME, 16, false);
        add("recents", 312, GA_RECENTS, 16, false); // KEYCODE_ALL_APPS-like; mostly via accessibility
        add("menu", 82, GA_NONE, 0, false);
        add("settings", 176, GA_NONE, 0, false);
        add("search", 84, GA_NONE, 0, false);
        add("info", 165, GA_NONE, 0, false);
        add("guide", 172, GA_NONE, 0, false);
        add("captions", 175, GA_NONE, 0, false);
        add("playpause", 85, GA_NONE, 0, true);
        add("play", 126, GA_NONE, 0, true);
        add("pause", 127, GA_NONE, 0, true);
        add("stop", 86, GA_NONE, 0, true);
        add("next", 87, GA_NONE, 0, true);
        add("prev", 88, GA_NONE, 0, true);
        add("ff", 90, GA_NONE, 0, true);
        add("rew", 89, GA_NONE, 0, true);
        add("volup", 24, GA_NONE, 0, false);
        add("voldown", 25, GA_NONE, 0, false);
        add("mute", 164, GA_NONE, 0, false);
        add("power", 26, GA_NONE, 0, false);
        add("del", 67, GA_NONE, 0, false);
        add("enter", 66, GA_NONE, 0, false);
        add("space", 62, GA_NONE, 0, false);
    }

    private Keys() {}

    public static Key get(String name) {
        return name == null ? null : ALL.get(name);
    }

    public static Map<String, Key> all() {
        return Collections.unmodifiableMap(ALL);
    }

    /**
     * Android key code for one character typed key by key (used when the TV
     * doesn't expose its text field). Returns 0 when there is no plain key for it.
     */
    public static int charKey(char c) {
        if (c >= 'a' && c <= 'z') return 29 + (c - 'a');
        if (c >= '0' && c <= '9') return 7 + (c - '0');
        switch (c) {
            case ' ': return 62;
            case '.': return 56;
            case ',': return 55;
            case '-': return 69;
            case '@': return 77;
            case '/': return 76;
            case '\n': return 66;
            default: return 0;
        }
    }
}
