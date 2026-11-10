package com.pereiranord.tvdrop;

import android.content.Context;
import android.content.Intent;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;

import java.util.Locale;

/**
 * Many MKV files carry DTS / TrueHD / AC3 audio that the TV's built-in
 * Android decoders can't play, so the video plays with no sound. This finds
 * out which audio tracks the TV can decode and, when none can, hands the
 * video to a player that decodes them in software (VLC, mpv, MX Player).
 */
public final class AudioSupport {
    /** In order of preference. These players decode DTS, TrueHD and AC3 in software. */
    static final String[] PLAYERS = {
            "org.videolan.vlc", "is.xyz.mpv", "com.mxtech.videoplayer.pro", "com.mxtech.videoplayer.ad",
    };

    private AudioSupport() {}

    /** Result of looking at a file's tracks. */
    public static final class Probe {
        public int audioTracks;
        public int playableTracks;
        public String firstUnplayable; // e.g. "DTS"
        public String summary = "";    // e.g. "DTS (sem suporte), AAC"
    }

    /** Reads the track list (network call for URLs: run off the main thread). Null on failure. */
    public static Probe probe(String src) {
        MediaExtractor ex = new MediaExtractor();
        try {
            ex.setDataSource(src);
            Probe p = new Probe();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime == null || !mime.startsWith("audio/")) continue;
                p.audioTracks++;
                boolean ok = canDecode(mime);
                if (ok) p.playableTracks++;
                else if (p.firstUnplayable == null) p.firstUnplayable = name(mime);
                String lang = f.containsKey(MediaFormat.KEY_LANGUAGE) ? f.getString(MediaFormat.KEY_LANGUAGE) : null;
                if (sb.length() > 0) sb.append(", ");
                sb.append(name(mime));
                if (lang != null && !lang.isEmpty() && !"und".equals(lang)) sb.append(" ").append(lang);
                if (!ok) sb.append(" (sem suporte)");
            }
            p.summary = sb.toString();
            return p;
        } catch (Exception e) {
            return null;
        } finally {
            ex.release();
        }
    }

    public static boolean canDecode(String mime) {
        if (mime == null) return false;
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
            if (info.isEncoder()) continue;
            for (String t : info.getSupportedTypes()) if (t.equalsIgnoreCase(mime)) return true;
        }
        return false;
    }

    public static String name(String mime) {
        if (mime == null) return "?";
        switch (mime.toLowerCase(Locale.ROOT)) {
            case "audio/vnd.dts": return "DTS";
            case "audio/vnd.dts.hd": return "DTS-HD";
            case "audio/vnd.dts.uhd": return "DTS:X";
            case "audio/ac3": return "Dolby Digital (AC3)";
            case "audio/eac3": return "Dolby Digital Plus (E-AC3)";
            case "audio/eac3-joc": return "Dolby Atmos (E-AC3)";
            case "audio/ac4": return "Dolby AC-4";
            case "audio/true-hd": return "Dolby TrueHD";
            case "audio/mp4a-latm": return "AAC";
            case "audio/mpeg": return "MP3";
            case "audio/opus": return "Opus";
            case "audio/vorbis": return "Vorbis";
            case "audio/flac": return "FLAC";
            case "audio/raw": return "PCM";
            default: return mime.substring(mime.indexOf('/') + 1).toUpperCase(Locale.ROOT);
        }
    }

    /** First installed external player, or null. */
    public static String externalPlayer(Context ctx) {
        for (String p : PLAYERS) {
            try {
                ctx.getPackageManager().getPackageInfo(p, 0);
                return p;
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    public static String playerName(String pkg) {
        if (pkg == null) return "";
        if (pkg.contains("vlc")) return "VLC";
        if (pkg.contains("mpv")) return "mpv";
        if (pkg.contains("mxtech")) return "MX Player";
        return pkg;
    }

    /** Opens a URL in the external player. Returns false if there is none or it refused. */
    public static boolean openExternal(Context ctx, String url, String title) {
        String pkg = externalPlayer(ctx);
        if (pkg == null || url == null || url.startsWith("/")) return false;
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(Uri.parse(url), "video/*");
        i.setPackage(pkg);
        i.putExtra("title", title);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
            Events.add("Abrindo no " + playerName(pkg) + ": " + title);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
