package com.pereiranord.tvdrop;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Starts the receiver again after the TV turns on and after TV Drop is updated: it runs in the background, so a
 * phone or browser can connect (and Google's code appears on the TV) without opening TV Drop on the TV.
 * Android only delivers these after the app was opened once since it was installed.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if ((Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a))
                && ctx.getPackageManager().hasSystemFeature("android.software.leanback")) {
            ServerService.start(ctx);
        }
    }
}
