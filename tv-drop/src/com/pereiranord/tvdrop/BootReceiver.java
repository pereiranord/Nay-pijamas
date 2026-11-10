package com.pereiranord.tvdrop;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the receiver again after the TV turns on. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            ServerService.start(ctx);
        }
    }
}
