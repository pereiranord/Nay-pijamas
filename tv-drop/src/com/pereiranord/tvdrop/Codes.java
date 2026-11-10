package com.pereiranord.tvdrop;

import java.util.Locale;

/**
 * The 8-letter code shown on the TV. It packs the TV's IPv4 address and port
 * (36 bits) in Crockford base32, so the phone can reach the TV with no lookup.
 * Example: 192.168.18.31:8080 -> "1G58-28FG".
 */
public final class Codes {
    private static final String ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    public static final int BASE_PORT = 8080;

    private Codes() {}

    /** Returns null when the address can't be encoded (no IPv4 or port out of range). */
    public static String encode(String ip, int port) {
        int off = port - BASE_PORT;
        if (off < 0 || off > 15 || ip == null) return null;
        String[] p = ip.split("\\.");
        if (p.length != 4) return null;
        long v = 0;
        try {
            for (String s : p) {
                int b = Integer.parseInt(s);
                if (b < 0 || b > 255) return null;
                v = (v << 8) | b;
            }
        } catch (NumberFormatException e) {
            return null;
        }
        v = (v << 4) | off;
        char[] out = new char[8];
        for (int i = 7; i >= 0; i--) {
            out[i] = ALPHA.charAt((int) (v & 31));
            v >>>= 5;
        }
        String s = new String(out);
        return s.substring(0, 4) + "-" + s.substring(4);
    }

    /** Returns {ip, port} or null when the code is not valid. */
    public static String[] decode(String code) {
        if (code == null) return null;
        String c = code.toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "")
                .replace('O', '0').replace('I', '1').replace('L', '1');
        if (c.length() != 8) return null;
        long v = 0;
        for (char ch : c.toCharArray()) {
            int d = ALPHA.indexOf(ch);
            if (d < 0) return null;
            v = (v << 5) | d;
        }
        if ((v >>> 36) != 0) return null;
        int port = BASE_PORT + (int) (v & 15);
        v >>>= 4;
        String ip = ((v >>> 24) & 255) + "." + ((v >>> 16) & 255) + "." + ((v >>> 8) & 255) + "." + (v & 255);
        return new String[]{ip, String.valueOf(port)};
    }
}
