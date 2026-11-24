package com.pereiranord.tvdrop;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

/** One code to connect: the code Google's remote service shows on the TV (FakeRemote accepts "ABC123"). */
public class GoogleCodePairingTest extends ServerTestBase {

    private String start() throws Exception {
        Res r = req("POST", "/api/v2/pair/start", "{\"name\":\"Celular\"}", null);
        assertEquals(r.body, 200, r.code);
        return new JSONObject(r.body).getString("session");
    }

    @Test
    public void theGoogleCodeAloneConnectsAndSavesTheDevice() throws Exception {
        String session = start();
        assertEquals(1, host.remote.pairStarts);
        Res r = req("POST", "/api/v2/pair", "{\"session\":\"" + session + "\",\"code\":\"abc123\",\"name\":\"Celular da Ana\"}", null);
        assertEquals(r.body, 200, r.code);
        String token = new JSONObject(r.body).getString("token");
        assertEquals("the TV's remote service was paired with the same code", "ABC123", host.remote.pairedCode);
        assertEquals("the device is saved", 200, req("GET", "/api/v2/session", (String) null, token).code);
        assertEquals("Celular da Ana", pairing.devices().get(0).name);
        assertFalse("TV Drop's own PIN never appeared", pairing.pinVisible());
    }

    @Test
    public void aWrongCodeEndsThatPairingAndAsksForANewOne() throws Exception {
        String session = start();
        Res r = req("POST", "/api/v2/pair", "{\"session\":\"" + session + "\",\"code\":\"FFFFFF\"}", null);
        assertEquals(403, r.code);
        assertTrue(new JSONObject(r.body).getBoolean("restart"));
        // the same session can't be tried again, even with the right code
        r = req("POST", "/api/v2/pair", "{\"session\":\"" + session + "\",\"code\":\"ABC123\"}", null);
        assertEquals(400, r.code);
        assertEquals("expired", new JSONObject(r.body).getString("error"));
        assertTrue(pairing.devices().isEmpty());
    }

    @Test
    public void aTypoKeepsThePairingOpen() throws Exception {
        String session = start();
        Res r = req("POST", "/api/v2/pair", "{\"session\":\"" + session + "\",\"code\":\"12345\"}", null);
        assertEquals(400, r.code);
        assertEquals("bad_format", new JSONObject(r.body).getString("error"));
        r = req("POST", "/api/v2/pair", "{\"session\":\"" + session + "\",\"code\":\"ABC123\"}", null);
        assertEquals(200, r.code);
    }

    @Test
    public void aCodeWithoutTheSessionThatShowedItIsRefused() throws Exception {
        start();
        Res r = req("POST", "/api/v2/pair", "{\"session\":\"0123456789abcdef01234567\",\"code\":\"ABC123\"}", null);
        assertEquals(400, r.code);
        assertTrue(pairing.devices().isEmpty());
    }

    @Test
    public void startsAreRateLimited() throws Exception {
        start();
        Res r = req("POST", "/api/v2/pair/start", "{}", null);
        assertEquals(429, r.code);
        assertEquals(1, host.remote.pairStarts);
    }

    @Test
    public void withoutGoogleServiceThePhoneIsToldToUseThePinWhichAppearsOnlyWhenAsked() throws Exception {
        host.remote.pairStartError = "connection refused";
        Res r = req("POST", "/api/v2/pair/start", "{}", null);
        assertEquals(503, r.code);
        assertEquals("pin", new JSONObject(r.body).getString("fallback"));
        assertFalse(pairing.pinVisible());
        assertEquals(200, req("POST", "/api/v2/pair/pin", "{}", null).code);
        assertTrue("the TV shows the PIN now", pairing.pinVisible());
        String t = pair();
        assertNotNull(t);
        assertFalse("and hides it after use", pairing.pinVisible());
    }

    @Test
    public void savedDevicesSurviveARestartAndDoNotExpire() throws Exception {
        KeyValueStore store = new KeyValueStore.Memory();
        long[] now = {1_000_000L};
        Pairing p = new Pairing(store, () -> now[0], new java.security.SecureRandom());
        String token = p.issue("Celular").token;
        now[0] += 400L * 24 * 3600 * 1000; // more than a year later, after the TV restarted
        Pairing afterRestart = new Pairing(store, () -> now[0], new java.security.SecureRandom());
        assertNotNull(afterRestart.check(token));
    }
}
