package com.pereiranord.tvdrop;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Phone: key presses from the home-screen widget and the quick-controls
 * notification, sent to the last TV this phone connected to (even with the
 * app closed). Uses the TV address and pairing token the app saved.
 */
public class RemoteKeyReceiver extends BroadcastReceiver {
    static final String ACTION_KEY = "com.pereiranord.tvdrop.KEY";
    static final String EXTRA_KEY = "key";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ACTION_KEY.equals(intent.getAction())) return;
        String key = intent.getStringExtra(EXTRA_KEY);
        if (key == null) return;
        if ("open".equals(key)) {
            ctx.startActivity(new Intent(ctx, RemoteActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return;
        }
        final PendingResult pending = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            String err = send(app, key);
            if (err != null) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> Toast.makeText(app, err, Toast.LENGTH_SHORT).show());
            }
            pending.finish();
        }, "tvdrop-quickkey").start();
    }

    /** Returns null on success or a short message. */
    static String send(Context ctx, String key) {
        SharedPreferences p = ctx.getSharedPreferences("tvdrop", Context.MODE_PRIVATE);
        String tv = p.getString("last", null);
        String token = tv == null ? null : p.getString("token:" + tv, null);
        if (tv == null || token == null) return "Abra o TV Drop e conecte a uma TV primeiro.";
        String old = Net.token;
        try {
            Net.token = token;
            String r = Net.post("http://" + tv + "/api/v2/remote/key", new JSONObject().put("key", key).toString());
            return Net.bool(r, "ok") ? null : "TV: " + Net.str(r, "message");
        } catch (Exception e) {
            return "A TV não respondeu (desligada ou fora do Wi-Fi).";
        } finally {
            Net.token = old != null ? old : token;
        }
    }

    static Intent intent(Context ctx, String key) {
        return new Intent(ctx, RemoteKeyReceiver.class).setAction(ACTION_KEY).putExtra(EXTRA_KEY, key);
    }
}
