package com.pereiranord.tvdrop;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * What a visitor's or a child's phone may do. The owner's devices may do everything. A visitor ("guest") uses the
 * remote, casts and plays, but can't manage the TV: devices and invites, settings, uninstalling or installing apps,
 * deleting files, updates, pairing the remote, routines. A child ("kids") is a visitor that also only works in the
 * agreed hours, can't open the TV's settings or change the input, and can't open the apps the owner blocked.
 */
final class Access {
    /** Owner-only paths (under /api, as HttpServer sees them). A prefix match on these covers their sub-paths. */
    static final Set<String> OWNER_ONLY = new HashSet<>(Arrays.asList(
            "/api/v2/devices", "/api/v2/settings", "/api/v2/invites", "/api/v2/remote/pair", "/api/v2/remote/unpair",
            "/api/v2/apps/uninstall", "/api/v2/apps/settings", "/api/v2/apps/store", "/api/v2/storage/delete",
            "/api/v2/storage/cache", "/api/v2/storage/apps", "/api/v2/update/install", "/api/v2/update/check",
            "/api/v2/routines/save", "/api/v2/routines/delete",
            "/api/install", "/api/delete"));
    static final Set<String> KIDS_KEYS = new HashSet<>(Arrays.asList("settings", "input"));

    private Access() {}

    static boolean ownerOnly(String path) {
        for (String p : OWNER_ONLY) if (path.equals(p) || path.startsWith(p + "/")) return true;
        return false;
    }

    /** Why this request is refused for this device, or null when it may go on. {@code minute}: minute of the day now. */
    static String deny(Pairing.Device d, String path, int minute) {
        if (d == null || d.isOwner()) return null;
        String h = hours(d, minute);
        if (h != null) return h;
        if (ownerOnly(path)) return "Este aparelho é de " + (d.isKids() ? "criança" : "visita") + ": só o dono da TV pode fazer isso.";
        return null;
    }

    static String denyKey(Pairing.Device d, String key, int minute) {
        if (d == null || d.isOwner()) return null;
        String h = hours(d, minute);
        if (h != null) return h;
        if (d.isKids() && KIDS_KEYS.contains(key)) return "Esta tecla está bloqueada no modo criança.";
        return null;
    }

    static String denyApp(Pairing.Device d, String pkg) {
        if (d == null || !d.isKids() || pkg == null) return null;
        return d.blocked.contains(pkg) ? "Este app está bloqueado no modo criança." : null;
    }

    private static String hours(Pairing.Device d, int minute) {
        if (d.isKids() && !d.inHours(minute)) return "Fora do horário combinado (" + d.hours.replace("-", " às ") + ").";
        return null;
    }

    /** "08:00-20:30" → {480, 1230}; null if malformed. A range like "20:00-07:00" crosses midnight. */
    static int[] range(String hours) {
        if (hours == null || !hours.matches("\\d{2}:\\d{2}-\\d{2}:\\d{2}")) return null;
        int a = Integer.parseInt(hours.substring(0, 2)) * 60 + Integer.parseInt(hours.substring(3, 5));
        int b = Integer.parseInt(hours.substring(6, 8)) * 60 + Integer.parseInt(hours.substring(9, 11));
        if (a >= 24 * 60 || b > 24 * 60) return null;
        return new int[]{a, b};
    }

    static boolean within(String hours, int minute) {
        int[] r = range(hours);
        if (r == null) return true;
        return r[0] <= r[1] ? minute >= r[0] && minute < r[1] : minute >= r[0] || minute < r[1];
    }

    static int minuteNow(long millis) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.setTimeInMillis(millis);
        return c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE);
    }
}
