package com.pereiranord.tvdrop;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;

/** Phone: an ongoing notification with play/pause and volume for the TV, also on the lock screen. */
final class QuickControls {
    private static final String CHANNEL = "quick";
    private static final int ID = 7;

    private QuickControls() {}

    static void show(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Controle rápido da TV", NotificationManager.IMPORTANCE_LOW));
        String tv = ctx.getSharedPreferences("tvdrop", Context.MODE_PRIVATE).getString("last", "");
        PendingIntent open = PendingIntent.getActivity(ctx, 70, new Intent(ctx, RemoteActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("TV Drop")
                .setContentText(tv.isEmpty() ? "Controle rápido" : "Controlando " + tv.split(":")[0])
                .setContentIntent(open)
                .setOngoing(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(action(ctx, "voldown", android.R.drawable.ic_media_previous, "Vol −", 71))
                .addAction(action(ctx, "playpause", android.R.drawable.ic_media_pause, "Play/Pausa", 72))
                .addAction(action(ctx, "volup", android.R.drawable.ic_media_next, "Vol +", 73))
                .addAction(action(ctx, "mute", android.R.drawable.ic_lock_silent_mode, "Mudo", 74))
                .setStyle(new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2))
                .build();
        nm.notify(ID, n);
    }

    static void hide(Context ctx) {
        ctx.getSystemService(NotificationManager.class).cancel(ID);
    }

    private static Notification.Action action(Context ctx, String key, int icon, String title, int req) {
        PendingIntent pi = PendingIntent.getBroadcast(ctx, req, RemoteKeyReceiver.intent(ctx, key), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(Icon.createWithResource(ctx, icon), title, pi).build();
    }
}
