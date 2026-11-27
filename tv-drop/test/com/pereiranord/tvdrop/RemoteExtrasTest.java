package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** Wake-on-LAN, one-line actions (Siri), routines, and visitor / child access. */
public class RemoteExtrasTest extends ServerTestBase {

    // ---- Wake-on-LAN ----

    @Test
    public void wakeOnLanPacketIsSixFfThenTheAddress16Times() {
        byte[] mac = WakeOnLan.parse("a4-5e-60-0b-1c-2d");
        assertArrayEquals(new byte[]{(byte) 0xa4, 0x5e, 0x60, 0x0b, 0x1c, 0x2d}, mac);
        byte[] p = WakeOnLan.packet(mac);
        assertEquals(102, p.length);
        for (int i = 0; i < 6; i++) assertEquals((byte) 0xff, p[i]);
        for (int r = 0; r < 16; r++) assertEquals((byte) 0x2d, p[6 + r * 6 + 5]);
        assertEquals("A4:5E:60:0B:1C:2D", WakeOnLan.normalize("a45e600b1c2d"));
        assertNull("Android's hidden address is not usable", WakeOnLan.parse("02:00:00:00:00:00"));
        assertNull(WakeOnLan.parse("nada"));
        assertEquals(Arrays.asList("255.255.255.255", "192.168.18.255", "192.168.18.31"), WakeOnLan.targets("192.168.18.31"));
    }

    @Test
    public void capabilitiesTellThePhoneHowToWakeTheTv() throws Exception {
        String t = pair();
        JSONObject c = new JSONObject(req("GET", "/api/v2/capabilities", (String) null, t).body);
        JSONObject wake = c.getJSONObject("wake");
        assertEquals("192.168.18.31", wake.getString("ip"));
        assertFalse(wake.getBoolean("keepAwake"));
        assertEquals("owner", c.getString("role"));
        JSONObject s = new JSONObject(req("POST", "/api/v2/settings", "{\"keepAwake\":true}", t).body);
        assertTrue(s.getBoolean("keepAwake"));
        assertTrue(host.keepAwake());
    }

    // ---- one-line actions (Siri Shortcuts) ----

    @Test
    public void actRunsAnActionFromALinkWithTheTokenInIt() throws Exception {
        String t = pair();
        assertEquals(200, req("GET", "/api/v2/act?token=" + t + "&key=ok&times=2", (String) null, null).code);
        assertEquals(Arrays.asList("ok", "ok"), host.remote.keys);
        assertEquals(200, req("GET", "/api/v2/act?token=" + t + "&app=netflix", (String) null, null).code);
        assertEquals("com.netflix.ninja", host.launched.get(host.launched.size() - 1));
        assertEquals(200, req("GET", "/api/v2/act?token=" + t + "&volume=up&times=3", (String) null, null).code);
        assertEquals(Arrays.asList("up", "up", "up"), host.volume);
        assertEquals(200, req("GET", "/api/v2/act?token=" + t + "&search=filmes%20de%20a%C3%A7%C3%A3o", (String) null, null).code);
        assertEquals("filmes de ação", host.searched);
        assertEquals(401, req("GET", "/api/v2/act?key=ok", (String) null, null).code);
        assertEquals(400, req("GET", "/api/v2/act?token=" + t, (String) null, null).code);
    }

    // ---- routines ----

    @Test
    public void routinesStartWithPresetsAndRunTheirActions() throws Exception {
        String t = pair();
        JSONArray list = new JSONObject(req("GET", "/api/v2/routines", (String) null, t).body).getJSONArray("routines");
        assertEquals("Boa noite", list.getJSONObject(0).getString("name"));

        String routine = "{\"routine\":{\"name\":\"Filme\",\"actions\":[{\"type\":\"key\",\"key\":\"home\"},"
                + "{\"type\":\"volume\",\"dir\":\"down\",\"steps\":2},{\"type\":\"app\",\"pkg\":\"com.netflix.ninja\"}]}}";
        JSONObject saved = new JSONObject(req("POST", "/api/v2/routines/save", routine, t).body).getJSONObject("routine");
        List<String> problems = Routines.run(saved, server.v2.routineActions(), ms -> { });
        assertTrue(problems.toString(), problems.isEmpty());
        assertTrue(host.remote.keys.contains("home"));
        assertEquals(Arrays.asList("down", "down"), host.volume);
        assertTrue(host.launched.contains("com.netflix.ninja"));

        assertEquals(400, req("POST", "/api/v2/routines/save", "{\"routine\":{\"name\":\"X\",\"actions\":[{\"type\":\"rm\"}]}}", t).code);
        assertEquals(400, req("POST", "/api/v2/routines/save", "{\"routine\":{\"name\":\"X\",\"time\":\"25:00\",\"actions\":[{\"type\":\"key\",\"key\":\"ok\"}]}}", t).code);
        assertEquals(200, req("POST", "/api/v2/routines/delete", "{\"id\":\"" + saved.getString("id") + "\"}", t).code);
    }

    @Test
    public void aScheduledRoutineRunsOnceInItsMinuteAndOnlyOnItsDays() throws Exception {
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.set(2026, java.util.Calendar.NOVEMBER, 27, 23, 30, 5); // a Friday
        long[] now = {c.getTimeInMillis()};
        Routines r = new Routines(new KeyValueStore.Memory(), () -> now[0]);
        r.save(new JSONObject().put("id", "sexta").put("name", "Sexta").put("time", "23:30").put("days", new JSONArray().put(java.util.Calendar.FRIDAY))
                .put("actions", new JSONArray().put(new JSONObject().put("type", "power").put("state", "off"))));
        r.save(new JSONObject().put("id", "sabado").put("name", "Sábado").put("time", "23:30").put("days", new JSONArray().put(java.util.Calendar.SATURDAY))
                .put("actions", new JSONArray().put(new JSONObject().put("type", "power").put("state", "off"))));
        List<String> ids = new ArrayList<>();
        for (JSONObject o : r.due()) ids.add(o.getString("id"));
        assertEquals(Arrays.asList("sexta"), ids);
        now[0] += 20_000; // same minute
        assertTrue(r.due().isEmpty());
        assertTrue("the preset 23:30 one is off by default", ids.size() == 1);
    }

    @Test
    public void powerActionsAskForAState() throws Exception {
        List<Boolean> asked = new ArrayList<>();
        Routines.Actions a = new Routines.Actions() {
            @Override public String key(String key) { return null; }
            @Override public String app(String pkg) { return "não instalado"; }
            @Override public String link(String url) { return null; }
            @Override public String text(String text) { return null; }
            @Override public String search(String query) { return null; }
            @Override public String volume(String dir) { return null; }
            @Override public String timer(long minutes, String action) { return null; }
            @Override public String power(boolean on) { asked.add(on); return null; }
        };
        JSONObject rt = new JSONObject().put("actions", new JSONArray()
                .put(new JSONObject().put("type", "power").put("state", "off"))
                .put(new JSONObject().put("type", "app").put("pkg", "x"))
                .put(new JSONObject().put("type", "power").put("state", "on")));
        List<String> problems = Routines.run(rt, a, ms -> { });
        assertEquals(Arrays.asList(false, true), asked);
        assertEquals(Arrays.asList("2. app: não instalado"), problems);
    }

    // ---- visitors and children ----

    private String redeem(String code) throws Exception {
        Res r = req("POST", "/api/v2/pair/invite", "{\"code\":\"" + code + "\",\"name\":\"Celular da visita\"}", null);
        assertEquals(r.body, 200, r.code);
        return new JSONObject(r.body).getString("token");
    }

    @Test
    public void aVisitorUsesTheRemoteButCannotManageTheTv() throws Exception {
        String owner = pair();
        JSONObject inv = new JSONObject(req("POST", "/api/v2/invites", "{\"role\":\"guest\",\"deviceHours\":4}", owner).body);
        assertTrue(inv.getString("url").contains("?convite=" + inv.getString("code")));
        String guest = redeem(inv.getString("code"));
        assertEquals(403, req("POST", "/api/v2/pair/invite", "{\"code\":\"" + inv.getString("code") + "\"}", null).code);

        assertEquals(200, req("POST", "/api/v2/remote/key", "{\"key\":\"ok\"}", guest).code);
        assertEquals(403, req("POST", "/api/v2/apps/uninstall", "{\"pkg\":\"com.netflix.ninja\"}", guest).code);
        assertEquals(403, req("GET", "/api/v2/devices", (String) null, guest).code);
        assertEquals(403, req("POST", "/api/v2/invites", "{\"role\":\"guest\"}", guest).code);
        assertEquals(403, req("POST", "/api/v2/settings", "{\"keepAwake\":true}", guest).code);
        assertEquals("guest", new JSONObject(req("GET", "/api/v2/capabilities", (String) null, guest).body).getString("role"));
        JSONArray devs = new JSONObject(req("GET", "/api/v2/devices", (String) null, owner).body).getJSONArray("devices");
        assertEquals("guest", devs.getJSONObject(1).getString("role"));
        assertTrue(devs.getJSONObject(1).getLong("expires") > System.currentTimeMillis());
    }

    @Test
    public void aChildCannotOpenBlockedAppsOrTheSettingsKey() throws Exception {
        String owner = pair();
        JSONObject inv = new JSONObject(req("POST", "/api/v2/invites",
                "{\"role\":\"kids\",\"deviceHours\":0,\"hours\":\"00:00-24:00\",\"blocked\":[\"com.netflix.ninja\"]}", owner).body);
        String kid = redeem(inv.getString("code"));
        assertEquals(403, req("POST", "/api/v2/apps/launch", "{\"pkg\":\"com.netflix.ninja\"}", kid).code);
        assertEquals(200, req("POST", "/api/v2/apps/launch", "{\"pkg\":\"com.example.globo\"}", kid).code);
        assertEquals(403, req("POST", "/api/v2/remote/key", "{\"key\":\"settings\"}", kid).code);
        assertEquals(200, req("POST", "/api/v2/remote/key", "{\"key\":\"up\"}", kid).code);
        Pairing.Device d = pairing.check(kid);
        String no = server.v2.handleWs("{\"t\":\"key\",\"k\":\"input\",\"id\":\"1\"}", "x", d);
        assertFalse(new JSONObject(no).getBoolean("ok"));
    }

    @Test
    public void hoursAndExpiry() throws Exception {
        assertTrue(Access.within("08:00-20:00", 8 * 60));
        assertFalse(Access.within("08:00-20:00", 20 * 60));
        assertTrue("crosses midnight", Access.within("20:00-07:00", 23 * 60));
        assertFalse(Access.within("20:00-07:00", 12 * 60));
        long[] now = {1_000_000L};
        Pairing p = new Pairing(new KeyValueStore.Memory(), () -> now[0], new java.security.SecureRandom());
        Pairing.Invite inv = p.invite("kids", 2, "08:00-20:00", Arrays.asList("com.netflix.ninja"), "Ana");
        Pairing.Result r = p.redeem(inv.code.toLowerCase(), "Aparelho");
        assertEquals("Ana", r.device.name);
        assertEquals("Fora do horário combinado (08:00 às 20:00).", Access.deny(r.device, "/api/v2/remote/key", 21 * 60));
        assertNull(Access.deny(r.device, "/api/v2/remote/key", 10 * 60));
        assertTrue(p.check(r.token) != null);
        now[0] += 2 * 3600_000L;
        assertNull("the device stops working when its time is up", p.check(r.token));
        try {
            p.invite("admin", 1, null, null, null);
            throw new AssertionError("accepted a bad role");
        } catch (IllegalArgumentException expected) {
        }
    }
}
