package com.pereiranord.tvdrop;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.wifi.WifiManager;
import android.os.PowerManager;

/**
 * "Pronto para ligar pelo celular": while on, TV Drop holds a partial wake lock and a Wi-Fi lock, so with the
 * screen off (standby) the TV keeps answering on the network and a phone can turn it back on (POWER/WAKEUP and a
 * wake lock that lights the screen). It costs standby power, so it is off unless the owner turns it on.
 */
final class StayReady {
    private static PowerManager.WakeLock wake;
    private static WifiManager.WifiLock wifi;

    private StayReady() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("tvdrop_power", Context.MODE_PRIVATE);
    }

    static boolean enabled(Context ctx) {
        return prefs(ctx).getBoolean("keepAwake", false);
    }

    static void set(Context ctx, boolean on) {
        prefs(ctx).edit().putBoolean("keepAwake", on).apply();
        apply(ctx);
        Events.add(on ? "Pronto para ligar pelo celular: o TV Drop fica acordado com a TV em repouso"
                : "Pronto para ligar pelo celular: desligado");
    }

    @SuppressWarnings("deprecation")
    static synchronized void apply(Context ctx) {
        Context app = ctx.getApplicationContext();
        boolean on = enabled(app);
        if (on && wake == null) {
            PowerManager pm = app.getSystemService(PowerManager.class);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tvdrop:ready");
            wake.setReferenceCounted(false);
            wake.acquire();
            WifiManager wm = app.getSystemService(WifiManager.class);
            if (wm != null) {
                wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "tvdrop:ready");
                wifi.setReferenceCounted(false);
                wifi.acquire();
            }
        } else if (!on && wake != null) {
            wake.release();
            wake = null;
            if (wifi != null) { wifi.release(); wifi = null; }
        }
    }
}
