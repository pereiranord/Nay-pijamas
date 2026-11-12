package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Streaming apps the "Apps" screen offers as starting favourites. Each lists the
 * Android TV package names it is known by, plus a name pattern as a fallback.
 * An app is only shown as installed when the TV actually reports one of them.
 */
final class AppCatalog {
    static final class Entry {
        final String id, name, color, link;
        final String[] packages;
        final Pattern label;

        Entry(String id, String name, String color, String link, String labelRegex, String... packages) {
            this.id = id;
            this.name = name;
            this.color = color;
            this.link = link;
            this.label = Pattern.compile(labelRegex, Pattern.CASE_INSENSITIVE);
            this.packages = packages;
        }
    }

    static final Entry[] ALL = {
            new Entry("netflix", "Netflix", "#E50914", "https://www.netflix.com/title", "^netflix$",
                    "com.netflix.ninja"),
            new Entry("youtube", "YouTube", "#FF0000", "https://www.youtube.com", "^youtube$",
                    "com.google.android.youtube.tv", "com.google.android.youtube.googletv"),
            new Entry("prime", "Prime Video", "#00A8E1", "https://app.primevideo.com", "prime video",
                    "com.amazon.amazonvideo.livingroom"),
            new Entry("disney", "Disney+", "#113CCF", "https://www.disneyplus.com", "disney\\s*\\+|disney plus",
                    "com.disney.disneyplus"),
            new Entry("appletv", "Apple TV", "#1C1C1E", null, "^apple tv",
                    "com.apple.atve.androidtv.appletv"),
            new Entry("max", "HBO Max", "#002BE7", null, "^(hbo\\s*)?max$",
                    "com.wbd.stream", "com.hbo.hbonow"),
            new Entry("globoplay", "Globoplay", "#FB0234", null, "globoplay",
                    "com.globo.globotv"),
            new Entry("sbt", "SBT+", "#0C3B8C", null, "^sbt", "br.com.sbt.app"),
            new Entry("pluto", "Pluto TV", "#2D2D2D", null, "pluto",
                    "tv.pluto.android"),
            new Entry("paramount", "Paramount+", "#0064FF", null, "paramount",
                    "com.cbs.ott", "com.cbs.ca"),
            new Entry("hulu", "Hulu", "#1CE783", null, "^hulu",
                    "com.hulu.livingroomplus"),
            new Entry("tubi", "Tubi", "#7408FF", null, "^tubi",
                    "com.tubitv"),
    };

    private AppCatalog() {}

    /** Catalog entries with the package actually installed on this TV (or null). */
    static JSONArray match(List<TvHost.AppInfo> installed) throws JSONException {
        JSONArray out = new JSONArray();
        for (Entry e : ALL) {
            String found = null;
            for (String p : e.packages) {
                for (TvHost.AppInfo a : installed) if (a.pkg.equals(p)) found = p;
                if (found != null) break;
            }
            if (found == null) {
                for (TvHost.AppInfo a : installed) {
                    if (a.label != null && e.label.matcher(a.label.trim().toLowerCase(Locale.ROOT)).find()) {
                        found = a.pkg;
                        break;
                    }
                }
            }
            JSONObject o = new JSONObject()
                    .put("id", e.id).put("name", e.name).put("color", e.color)
                    .put("packages", new JSONArray(java.util.Arrays.asList(e.packages)))
                    .put("installed", found == null ? JSONObject.NULL : found);
            if (e.link != null) o.put("link", e.link);
            out.put(o);
        }
        return out;
    }
}
