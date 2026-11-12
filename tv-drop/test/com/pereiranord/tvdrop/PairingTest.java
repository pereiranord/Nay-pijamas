package com.pereiranord.tvdrop;

import org.junit.Test;

import java.security.SecureRandom;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class PairingTest {
    private final AtomicLong now = new AtomicLong(1_000_000);
    private final KeyValueStore store = new KeyValueStore.Memory();

    private Pairing newPairing() {
        return new Pairing(store, now::get, new SecureRandom());
    }

    @Test
    public void pinIsSixDigitsAndRotatesAfterTwoMinutes() {
        Pairing p = newPairing();
        String pin = p.pin();
        assertTrue(pin.matches("\\d{6}"));
        now.addAndGet(Pairing.PIN_TTL_MS - 1);
        assertEquals(pin, p.pin());
        now.addAndGet(2);
        // a new PIN is drawn (it can repeat by chance only 1 in a million times)
        assertTrue(p.pinExpiresAt() > now.get());
    }

    @Test
    public void correctPinGivesAWorkingTokenAndPinIsSingleUse() throws Exception {
        Pairing p = newPairing();
        String pin = p.pin();
        Pairing.Result r = p.pair(pin, "Celular da Ana");
        assertEquals(64, r.token.length());
        assertNotNull(p.check(r.token));
        assertEquals("Celular da Ana", p.check(r.token).name);
        try {
            p.pair(pin, "outro");
            if (!pin.equals(p.pin())) fail("PIN should be single use");
        } catch (Pairing.Refused expected) {
        }
    }

    @Test
    public void pinWithSpacesIsAccepted() throws Exception {
        Pairing p = newPairing();
        String pin = p.pin();
        assertNotNull(p.pair(pin.substring(0, 3) + " " + pin.substring(3), "x").token);
    }

    @Test
    public void fiveWrongTriesRotateThePin() {
        Pairing p = newPairing();
        String pin = p.pin();
        String wrong = pin.equals("000000") ? "111111" : "000000";
        for (int i = 0; i < Pairing.MAX_FAILURES; i++) {
            try {
                p.pair(wrong, "x");
                fail();
            } catch (Pairing.Refused expected) {
            }
        }
        assertNotEquals("after 5 failures the PIN must change", pin, p.pin());
    }

    @Test
    public void unknownTokensAreRejected() {
        Pairing p = newPairing();
        assertNull(p.check(null));
        assertNull(p.check("short"));
        assertNull(p.check("0000000000000000000000000000000000000000000000000000000000000000"));
    }

    @Test
    public void devicesSurviveRestartAndCanBeRevoked() throws Exception {
        Pairing p = newPairing();
        Pairing.Result r = p.pair(p.pin(), "Sala");
        Pairing again = newPairing();          // same store = app restarted
        assertNotNull(again.check(r.token));
        assertTrue(again.rename(r.device.id, "Quarto"));
        assertEquals("Quarto", again.devices().get(0).name);
        assertTrue(again.revoke(r.device.id));
        assertNull(again.check(r.token));
        assertFalse(newPairing().devices().iterator().hasNext());
    }

    @Test
    public void storeHoldsHashesNotTokens() throws Exception {
        Pairing p = newPairing();
        Pairing.Result r = p.pair(p.pin(), "x");
        assertFalse(store.get("pair.devices").contains(r.token));
    }

    @Test
    public void namesAreCleaned() {
        assertEquals("Aparelho", Pairing.cleanName(null));
        assertEquals("Aparelho", Pairing.cleanName("   "));
        assertEquals("abc", Pairing.cleanName("<abc>"));
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 100; i++) longName.append('x');
        assertEquals(40, Pairing.cleanName(longName.toString()).length());
    }

    @Test
    public void legacyFlagPersists() {
        Pairing p = newPairing();
        assertFalse(p.legacyOpen());
        p.setLegacyOpen(true);
        assertTrue(newPairing().legacyOpen());
    }
}
