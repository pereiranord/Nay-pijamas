package com.pereiranord.tvdrop;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** Phone home-screen widget: play/pause, volume, mute, and a tap on the title opens the app. */
public class TvDropWidget extends AppWidgetProvider {
    private static final int[][] BUTTONS = {
            {R.id.w_voldown, 0}, {R.id.w_playpause, 1}, {R.id.w_volup, 2}, {R.id.w_mute, 3}, {R.id.w_title, 4},
    };
    private static final String[] KEYS = {"voldown", "playpause", "volup", "mute", "open"};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        String tv = ctx.getSharedPreferences("tvdrop", Context.MODE_PRIVATE).getString("last", "");
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_remote);
            v.setTextViewText(R.id.w_title, tv.isEmpty() ? "TV Drop · toque para conectar" : "TV Drop · " + tv.split(":")[0]);
            for (int[] b : BUTTONS) {
                PendingIntent pi = PendingIntent.getBroadcast(ctx, 100 + b[1], RemoteKeyReceiver.intent(ctx, KEYS[b[1]]),
                        PendingIntent.FLAG_IMMUTABLE);
                v.setOnClickPendingIntent(b[0], pi);
            }
            mgr.updateAppWidget(id, v);
        }
    }
}
