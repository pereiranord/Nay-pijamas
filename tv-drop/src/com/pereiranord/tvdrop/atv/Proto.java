package com.pereiranord.tvdrop.atv;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Just enough Protocol Buffers for the Android TV Remote protocol: varint and
 * length-delimited fields, plus the varint length prefix that frames each message.
 */
public final class Proto {
    private final ByteArrayOutputStream buf = new ByteArrayOutputStream();

    public Proto varint(int field, long value) {
        writeVarint(buf, ((long) field << 3));
        writeVarint(buf, value);
        return this;
    }

    public Proto bytes(int field, byte[] value) {
        writeVarint(buf, ((long) field << 3) | 2);
        writeVarint(buf, value.length);
        buf.write(value, 0, value.length);
        return this;
    }

    public Proto string(int field, String value) {
        return bytes(field, value.getBytes(StandardCharsets.UTF_8));
    }

    public Proto message(int field, Proto value) {
        return bytes(field, value.toByteArray());
    }

    public byte[] toByteArray() {
        return buf.toByteArray();
    }

    // ---- framing ----

    public static void writeFramed(OutputStream out, byte[] msg) throws IOException {
        ByteArrayOutputStream f = new ByteArrayOutputStream(msg.length + 5);
        writeVarint(f, msg.length);
        f.write(msg, 0, msg.length);
        out.write(f.toByteArray());
        out.flush();
    }

    public static byte[] readFramed(InputStream in) throws IOException {
        long len = readVarint(in);
        if (len < 0 || len > 1 << 20) throw new IOException("bad message length " + len);
        byte[] b = new byte[(int) len];
        int off = 0;
        while (off < b.length) {
            int n = in.read(b, off, b.length - off);
            if (n < 0) throw new EOFException();
            off += n;
        }
        return b;
    }

    static void writeVarint(ByteArrayOutputStream out, long v) {
        while ((v & ~0x7FL) != 0) {
            out.write((int) ((v & 0x7F) | 0x80));
            v >>>= 7;
        }
        out.write((int) v);
    }

    static long readVarint(InputStream in) throws IOException {
        long r = 0;
        for (int shift = 0; shift < 64; shift += 7) {
            int b = in.read();
            if (b < 0) throw new EOFException();
            r |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) return r;
        }
        throw new IOException("varint too long");
    }

    // ---- parsing ----

    /** A parsed message: field number -> values (Long for varints, byte[] for length-delimited). */
    public static final class Msg {
        private final Map<Integer, List<Object>> fields = new LinkedHashMap<>();

        public static Msg parse(byte[] data) throws IOException {
            Msg m = new Msg();
            int[] pos = {0};
            while (pos[0] < data.length) {
                long key = varintAt(data, pos);
                int field = (int) (key >>> 3), wt = (int) (key & 7);
                Object v;
                switch (wt) {
                    case 0: v = varintAt(data, pos); break;
                    case 2: {
                        int n = (int) varintAt(data, pos);
                        if (n < 0 || pos[0] + n > data.length) throw new IOException("truncated field");
                        byte[] b = new byte[n];
                        System.arraycopy(data, pos[0], b, 0, n);
                        pos[0] += n;
                        v = b;
                        break;
                    }
                    case 5: pos[0] += 4; continue;
                    case 1: pos[0] += 8; continue;
                    default: throw new IOException("unsupported wire type " + wt);
                }
                m.fields.computeIfAbsent(field, k -> new ArrayList<>()).add(v);
            }
            return m;
        }

        private static long varintAt(byte[] d, int[] pos) throws IOException {
            long r = 0;
            for (int shift = 0; shift < 64; shift += 7) {
                if (pos[0] >= d.length) throw new IOException("truncated varint");
                int b = d[pos[0]++] & 0xFF;
                r |= (long) (b & 0x7F) << shift;
                if ((b & 0x80) == 0) return r;
            }
            throw new IOException("varint too long");
        }

        public boolean has(int field) {
            return fields.containsKey(field);
        }

        public long num(int field, long def) {
            List<Object> v = fields.get(field);
            return v != null && v.get(0) instanceof Long ? (Long) v.get(0) : def;
        }

        public byte[] raw(int field) {
            List<Object> v = fields.get(field);
            return v != null && v.get(0) instanceof byte[] ? (byte[]) v.get(0) : null;
        }

        public String str(int field) {
            byte[] b = raw(field);
            return b == null ? null : new String(b, StandardCharsets.UTF_8);
        }

        /** Nested message, or an empty one when the field is missing. */
        public Msg msg(int field) throws IOException {
            byte[] b = raw(field);
            return b == null ? new Msg() : parse(b);
        }

        public List<Object> all(int field) {
            List<Object> v = fields.get(field);
            return v == null ? Collections.emptyList() : v;
        }
    }
}
