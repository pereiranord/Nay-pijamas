package com.pereiranord.tvdrop;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Wake-on-LAN: the "magic packet" that turns on a TV in deep standby (when the TV has "turn on with Wi-Fi/network"
 * enabled). The TV tells the phone its network address (MAC) while it is on; the phone app sends the packet later,
 * when the TV can no longer answer. Browsers can't send it (no UDP), the Android app can.
 */
final class WakeOnLan {
    static final int[] PORTS = {9, 7};

    private WakeOnLan() {}

    /** "AA:BB:CC:DD:EE:FF", "aa-bb-..." or "aabbccddeeff" → 6 bytes; null if not a usable address. */
    static byte[] parse(String mac) {
        if (mac == null) return null;
        String hex = mac.trim().replaceAll("[:\\-.\\s]", "");
        if (!hex.matches("(?i)[0-9a-f]{12}")) return null;
        byte[] b = new byte[6];
        for (int i = 0; i < 6; i++) b[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        boolean zero = true;
        for (byte x : b) if (x != 0) zero = false;
        // Android answers 02:00:00:00:00:00 when it hides the real address
        if (zero || hex.equalsIgnoreCase("020000000000")) return null;
        return b;
    }

    /** The usual written form, "AA:BB:CC:DD:EE:FF", or null. */
    static String normalize(String mac) {
        byte[] b = parse(mac);
        if (b == null) return null;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 6; i++) sb.append(i == 0 ? "" : ":").append(String.format(Locale.ROOT, "%02X", b[i] & 0xff));
        return sb.toString();
    }

    /** 6 × 0xFF, then the address 16 times. */
    static byte[] packet(byte[] mac) {
        byte[] p = new byte[6 + 16 * 6];
        for (int i = 0; i < 6; i++) p[i] = (byte) 0xff;
        for (int r = 0; r < 16; r++) System.arraycopy(mac, 0, p, 6 + r * 6, 6);
        return p;
    }

    /** Where to send: everyone on the network, plus the TV's /24 broadcast and the TV itself (some routers keep it). */
    static List<String> targets(String tvIp) {
        List<String> t = new ArrayList<>();
        t.add("255.255.255.255");
        if (tvIp != null && tvIp.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")) {
            t.add(tvIp.substring(0, tvIp.lastIndexOf('.')) + ".255");
            t.add(tvIp);
        }
        return t;
    }

    /** Sends the packet 3 times to every target and port. Returns how many were sent. */
    static int send(String mac, String tvIp) throws IOException {
        byte[] m = parse(mac);
        if (m == null) throw new IOException("Endereço MAC inválido: " + mac);
        byte[] p = packet(m);
        int sent = 0;
        IOException last = null;
        try (DatagramSocket s = new DatagramSocket()) {
            s.setBroadcast(true);
            for (int round = 0; round < 3; round++) {
                for (String target : targets(tvIp)) {
                    for (int port : PORTS) {
                        try {
                            s.send(new DatagramPacket(p, p.length, InetAddress.getByName(target), port));
                            sent++;
                        } catch (IOException e) {
                            last = e;
                        }
                    }
                }
            }
        }
        if (sent == 0 && last != null) throw last;
        return sent;
    }

    /** This device's MAC on the interface that has {@code ip} (the TV tells the phone). Null when Android hides it. */
    static String localMac(String ip) {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                boolean match = false;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) if (a.getHostAddress().equals(ip)) match = true;
                if (!match) continue;
                String m = null;
                byte[] hw = ni.getHardwareAddress();
                if (hw != null && hw.length == 6) {
                    StringBuilder sb = new StringBuilder();
                    for (byte x : hw) sb.append(String.format(Locale.ROOT, "%02x", x & 0xff));
                    m = normalize(sb.toString());
                }
                if (m == null) m = normalize(readFile("/sys/class/net/" + ni.getName() + "/address"));
                return m;
            }
        } catch (Exception ignored) {
            // no interfaces visible
        }
        return null;
    }

    private static String readFile(String path) {
        try {
            return new String(java.nio.file.Files.readAllBytes(new java.io.File(path).toPath()), StandardCharsets.UTF_8).trim();
        } catch (Exception e) {
            return null;
        }
    }
}
