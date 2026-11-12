package com.pereiranord.tvdrop;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Screen mirroring stream, phone -> TV, over TCP on port 8100.
 *   handshake (text line): "TVDROP-MIRROR 1 <pairing token>\n"   -> TV answers "OK\n" or "NO <reason>\n"
 *   then packets: [type:1][length:4][ptsUs:8][payload]
 *     CONFIG (1): width:4, height:4, then the H.264 SPS/PPS (Annex B)
 *     FRAME  (2): one H.264 access unit (Annex B); KEYFRAME (3) same for sync frames
 *     END    (0): the phone stopped
 */
final class MirrorProtocol {
    static final int PORT = 8100;
    static final int END = 0, CONFIG = 1, FRAME = 2, KEYFRAME = 3;
    static final int MAX_PACKET = 8 << 20;

    private MirrorProtocol() {}

    static final class Packet {
        final int type;
        final long ptsUs;
        final byte[] data;

        Packet(int type, long ptsUs, byte[] data) {
            this.type = type;
            this.ptsUs = ptsUs;
            this.data = data;
        }
    }

    static void write(DataOutputStream out, int type, long ptsUs, byte[] data, int off, int len) throws IOException {
        out.writeByte(type);
        out.writeInt(len);
        out.writeLong(ptsUs);
        out.write(data, off, len);
    }

    static Packet read(DataInputStream in) throws IOException {
        int type = in.readUnsignedByte();
        int len = in.readInt();
        long pts = in.readLong();
        if (len < 0 || len > MAX_PACKET) throw new IOException("pacote inválido");
        byte[] b = new byte[len];
        in.readFully(b);
        return new Packet(type, pts, b);
    }

    static void hello(OutputStream out, String token) throws IOException {
        out.write(("TVDROP-MIRROR 1 " + token + "\n").getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }

    /** Reads one text line (handshake), at most 512 bytes. */
    static String line(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1 && c != '\n') {
            sb.append((char) c);
            if (sb.length() > 512) throw new IOException("linha grande demais");
        }
        if (c == -1 && sb.length() == 0) throw new IOException("conexão fechada");
        return sb.toString().trim();
    }

    /** Splits Annex-B data into NAL units (without start codes). */
    static java.util.List<byte[]> nalUnits(byte[] b) {
        java.util.List<byte[]> out = new java.util.ArrayList<>();
        int i = 0, start = -1;
        while (i + 3 <= b.length) {
            boolean sc3 = b[i] == 0 && b[i + 1] == 0 && b[i + 2] == 1;
            boolean sc4 = i + 4 <= b.length && b[i] == 0 && b[i + 1] == 0 && b[i + 2] == 0 && b[i + 3] == 1;
            if (sc3 || sc4) {
                if (start >= 0) out.add(java.util.Arrays.copyOfRange(b, start, trimZeros(b, start, i)));
                i += sc4 ? 4 : 3;
                start = i;
            } else {
                i++;
            }
        }
        if (start >= 0 && start < b.length) out.add(java.util.Arrays.copyOfRange(b, start, b.length));
        return out;
    }

    private static int trimZeros(byte[] b, int from, int to) {
        while (to > from && b[to - 1] == 0) to--;
        return to;
    }
}
