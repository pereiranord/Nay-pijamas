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

    /** Adds a phone file to the TV's queue, served from the phone (mode: end | next | now). */
    static String queue(Context ctx, String tv, Uri u, String mode) {
        try {
            String name = displayName(ctx, u);
            int port = StreamService.ensure(ctx, u);
            String[] hp = tv.split(":");
            String me = Net.localAddressTowards(hp[0], Integer.parseInt(hp[1]));
            String path = StreamService.server().serve(u, ctx.getContentResolver().getType(u), name);
            org.json.JSONObject body = new org.json.JSONObject().put("src", "http://" + me + ":" + port + path)
                    .put("title", name).put("mode", mode);
            String r = Net.post("http://" + tv + "/api/v2/queue/add", body.toString());
            return Net.bool(r, "ok") ? null : Net.str(r, "message");
        } catch (Exception e) {
            return e.getMessage();
        }
    }

    /** Copies a file to the TV's "received files" (photos, documents, APKs...). */
    static String upload(Context ctx, String tv, Uri u, boolean autoOpen) {
        String name = displayName(ctx, u);
        long size = -1;
        try (android.database.Cursor c = ctx.getContentResolver().query(u, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) size = c.getLong(0);
        } catch (Exception ignored) {
        }
        if (size <= 0) return "Tamanho do arquivo desconhecido: " + name;
        try (java.io.InputStream in = ctx.getContentResolver().openInputStream(u)) {
            String url = "http://" + tv + "/api/upload?name=" + java.net.URLEncoder.encode(name, "UTF-8") + (autoOpen ? "&auto=1" : "");
            String r = Net.upload(url, in, size, null);
            return Net.bool(r, "ok") ? null : Net.str(r, "message");
        } catch (Exception e) {
            return e.getMessage();
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
