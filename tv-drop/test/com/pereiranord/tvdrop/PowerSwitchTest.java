package com.pereiranord.tvdrop;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** Power: each way is tried until the TV really changes state, and a silent failure is reported as one. */
public class PowerSwitchTest {
    private final List<String> sent = new ArrayList<>();
    private final AtomicBoolean off = new AtomicBoolean();

    private PowerSwitch.Step works(String name) {
        return new PowerSwitch.Step(name, () -> { sent.add(name); off.set(true); return null; });
    }

    private PowerSwitch.Step ignored(String name) {
        return new PowerSwitch.Step(name, () -> { sent.add(name); return null; });
    }

    private PowerSwitch.Result run(PowerSwitch.Step... steps) {
        return PowerSwitch.run(Arrays.asList(steps), off::get, 600, ms -> { }, "sem caminho", "não desligou");
    }

    @Test
    public void theFirstWayThatWorksStopsTheRest() {
        PowerSwitch.Result r = run(works("POWER"), works("SLEEP"));
        assertNull(r.error);
        assertEquals("POWER", r.via);
        assertEquals(Arrays.asList("POWER"), sent);
    }

    @Test
    public void aKeyTheTvIgnoresFallsBackToTheNextWay() {
        PowerSwitch.Result r = run(ignored("POWER"), works("SLEEP"), works("lock"));
        assertNull(r.error);
        assertEquals("SLEEP", r.via);
        assertEquals(Arrays.asList("POWER", "SLEEP"), sent);
    }

    @Test
    public void sentButStillOnIsAnErrorNotAnOk() {
        PowerSwitch.Result r = run(ignored("POWER"), ignored("SLEEP"));
        assertEquals("não desligou", r.error);
        assertEquals(Arrays.asList("POWER", "SLEEP"), r.sent);
    }

    @Test
    public void noWayToSendSaysWhy() {
        PowerSwitch.Result r = run(new PowerSwitch.Step("controle", () -> "não pareado"),
                new PowerSwitch.Step("acessibilidade", () -> { throw new IllegalStateException("desligada"); }));
        assertTrue(r.error, r.error.startsWith("sem caminho (controle: não pareado; acessibilidade: desligada)"));
        assertTrue(r.sent.isEmpty());
    }

    @Test
    public void aWayThatFailsToSendIsSkipped() {
        PowerSwitch.Result r = run(new PowerSwitch.Step("controle", () -> { throw new java.io.IOException("conexão caiu"); }), works("lock"));
        assertNull(r.error);
        assertEquals("lock", r.via);
    }
}
