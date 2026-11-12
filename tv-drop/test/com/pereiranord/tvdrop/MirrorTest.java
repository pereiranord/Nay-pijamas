package com.pereiranord.tvdrop;

import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.util.List;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class MirrorTest extends ServerTestBase {

    @Test
    public void splitsAnnexBIntoNalUnits() {
        byte[] data = {0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x68, 3, 0, 0, 0, 1, 0x65, 9, 9};
        List<byte[]> nals = MirrorProtocol.nalUnits(data);
        assertEquals(3, nals.size());
        assertEquals(7, nals.get(0)[0] & 0x1f); // SPS
        assertArrayEquals(new byte[]{0x67, 1, 2}, nals.get(0));
        assertEquals(8, nals.get(1)[0] & 0x1f); // PPS
        assertArrayEquals(new byte[]{0x68, 3}, nals.get(1));
        assertEquals(5, nals.get(2)[0] & 0x1f); // IDR
    }

    @Test
    public void packetsRoundTrip() throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(b);
        byte[] frame = {1, 2, 3, 4, 5};
        MirrorProtocol.write(out, MirrorProtocol.KEYFRAME, 123456789L, frame, 1, 3);
        MirrorProtocol.write(out, MirrorProtocol.END, 0, new byte[0], 0, 0);
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(b.toByteArray()));
        MirrorProtocol.Packet p = MirrorProtocol.read(in);
        assertEquals(MirrorProtocol.KEYFRAME, p.type);
        assertEquals(123456789L, p.ptsUs);
        assertArrayEquals(new byte[]{2, 3, 4}, p.data);
        assertEquals(MirrorProtocol.END, MirrorProtocol.read(in).type);
    }

    @Test
    public void handshakeLine() throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        MirrorProtocol.hello(b, "abc");
        assertEquals("TVDROP-MIRROR 1 abc", MirrorProtocol.line(new ByteArrayInputStream(b.toByteArray())));
    }

    @Test
    public void stopRouteAndCapabilities() throws Exception {
        String t = pair();
        assertEquals(409, req("POST", "/api/v2/mirror/stop", "", t).code);
        host.mirroring = true;
        assertTrue(new JSONObject(req("GET", "/api/v2/capabilities", (String) null, t).body).getJSONObject("mirror").getBoolean("active"));
        assertEquals(200, req("POST", "/api/v2/mirror/stop", "", t).code);
        assertFalse(host.mirroring);
    }
}
