package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Subtitle search and download through the OpenSubtitles REST API, called from the TV
 * with the user's own API key (opensubtitles.com -> API consumers). Results are saved
 * next to the received files as .srt so the player can load them.
 */
public class Subtitles {
    static final String DEFAULT_BASE = "https://api.opensubtitles.com/api/v1";
    private final String base;
    private final String apiKey;

    public Subtitles(String apiKey) {
        this(DEFAULT_BASE, apiKey);
    }

    Subtitles(String base, String apiKey) {
        this.base = base;
        this.apiKey = apiKey;
    }

    /** [{"fileId","name","release","language","downloads","title","year"}] */
    public JSONArray search(String query, String languages) throws IOException, JSONException {
        String url = base + "/subtitles?query=" + URLEncoder.encode(query, "UTF-8")
                + "&languages=" + URLEncoder.encode(languages == null || languages.isEmpty() ? "pt-br,pt" : languages, "UTF-8");
        JSONObject r = new JSONObject(call("GET", url, null));
        JSONArray out = new JSONArray();
        JSONArray data = r.optJSONArray("data");
        if (data == null) return out;
        for (int i = 0; i < data.length() && out.length() < 20; i++) {
            JSONObject a = data.getJSONObject(i).optJSONObject("attributes");
            if (a == null) continue;
            JSONArray files = a.optJSONArray("files");
            if (files == null || files.length() == 0) continue;
            JSONObject f = files.getJSONObject(0);
            JSONObject feat = a.optJSONObject("feature_details");
            out.put(new JSONObject()
                    .put("fileId", f.optLong("file_id"))
                    .put("name", f.optString("file_name", a.optString("release")))
                    .put("release", a.optString("release"))
                    .put("language", a.optString("language"))
                    .put("downloads", a.optInt("download_count"))
                    .put("title", feat == null ? "" : feat.optString("title"))
                    .put("year", feat == null ? 0 : feat.optInt("year")));
        }
        return out;
    }

    /** Downloads one subtitle into {@code dir}; returns the saved file. */
    public File download(long fileId, File dir, String baseName) throws IOException, JSONException {
        JSONObject r = new JSONObject(call("POST", base + "/download", new JSONObject().put("file_id", fileId).toString()));
        String link = r.optString("link", null);
        if (link == null || link.isEmpty()) throw new IOException(r.optString("message", "OpenSubtitles não liberou o download (limite diário?)."));
        String safe = HttpServer.safeName((baseName == null || baseName.isEmpty() ? "legenda" : baseName) + ".srt");
        File out = new File(dir, safe == null ? "legenda.srt" : safe);
        HttpURLConnection c = (HttpURLConnection) new URL(link).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(20000);
        try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[16384];
            int n;
            long total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > 5L << 20) throw new IOException("legenda grande demais");
                o.write(buf, 0, n);
            }
        } finally {
            c.disconnect();
        }
        return out;
    }

    private String call(String method, String url, String body) throws IOException {
        if (apiKey == null || apiKey.isEmpty()) throw new IOException("Configure a chave do OpenSubtitles primeiro.");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(8000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Api-Key", apiKey);
        c.setRequestProperty("User-Agent", "TVDrop v2");
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            byte[] b = body.getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setFixedLengthStreamingMode(b.length);
            try (OutputStream o = c.getOutputStream()) {
                o.write(b);
            }
        }
        try {
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
            }
            String text = bo.toString("UTF-8");
            if (code == 401 || code == 403) throw new IOException("Chave do OpenSubtitles recusada.");
            if (code >= 400) {
                String msg = text;
                try { msg = new JSONObject(text).optString("message", text); } catch (JSONException ignored) {}
                throw new IOException("OpenSubtitles: " + (msg.length() > 160 ? msg.substring(0, 160) : msg));
            }
            return text;
        } finally {
            c.disconnect();
        }
    }
}
