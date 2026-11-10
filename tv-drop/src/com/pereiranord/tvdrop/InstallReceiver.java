package com.pereiranord.tvdrop;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Receives the result of an install; shows Android's confirmation screen when it asks for one. */
public class InstallReceiver extends BroadcastReceiver {
    public static final String EXTRA_NAME = "name";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String name = intent.getStringExtra(EXTRA_NAME);
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            @SuppressWarnings("deprecation")
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    ctx.startActivity(confirm);
                    Events.add("Confirme a instalação na TV: " + name);
                } catch (Exception e) {
                    Events.add("Não consegui abrir a confirmação (" + e.getMessage() + "). Abra o TV Drop e tente de novo.");
                }
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            Events.add("Instalado com sucesso: " + name);
        } else {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Events.add("Falha ao instalar " + name + ": " + msg);
        }
    }
}
