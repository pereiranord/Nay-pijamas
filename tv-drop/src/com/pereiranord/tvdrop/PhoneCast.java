package com.pereiranord.tvdrop;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

/** Phone side: serve a picked file from the phone and tell the TV to play it (no copy). */
final class PhoneCast {
    private PhoneCast() {}

    /** Blocking (run off the main thread). Returns null on success or the TV's/our error message. */
    static String cast(Context ctx, String tv, Uri u) {
        try {
            String name = displayName(ctx, u);
            int port = StreamService.ensure(ctx, u);
            String[] hp = tv.split(":");
            String me = Net.localAddressTowards(hp[0], Integer.parseInt(hp[1]));
            String type = ctx.getContentResolver().getType(u);
            String path = StreamService.server().serve(u, type, name);
            String r = Net.post("http://" + tv + "/api/play", "http://" + me + ":" + port + path);
            return Net.bool(r, "ok") ? null : "A TV recusou: " + Net.str(r, "message");
        } catch (Exception e) {
            return "Não consegui transmitir: " + e.getMessage();
        }
    }

    static String displayName(Context ctx, Uri u) {
        try (Cursor c = ctx.getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
        } catch (Exception ignored) {
        }
        String last = u.getLastPathSegment();
        return last == null ? "video" : last;
    }
}
