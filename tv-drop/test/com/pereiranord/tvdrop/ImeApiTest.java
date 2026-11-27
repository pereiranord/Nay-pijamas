package com.pereiranord.tvdrop;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** The phone asks whether the TV's keyboard is up, to offer its own (GET /api/v2/remote/ime and WebSocket "ime"). */
public class ImeApiTest extends ServerTestBase {
    @Test
    public void keyboardStateFollowsTheTv() throws Exception {
        String t = pair();
        JSONObject st = new JSONObject(req("GET", "/api/v2/remote/ime", (String) null, t).body);
        assertFalse(st.getBoolean("active"));
        assertTrue(st.getBoolean("known"));

        req("POST", "/api/v2/remote/key", "{\"key\":\"search\"}", t);
        st = new JSONObject(req("GET", "/api/v2/remote/ime", (String) null, t).body);
        assertTrue(st.getBoolean("active"));
        assertEquals("Pesquisar", st.getString("label"));

        req("POST", "/api/v2/remote/text", "{\"text\":\"filmes\"}", t);
        assertEquals("filmes", new JSONObject(req("GET", "/api/v2/remote/ime", (String) null, t).body).getString("value"));

        req("POST", "/api/v2/remote/key", "{\"key\":\"back\"}", t);
        assertFalse(new JSONObject(req("GET", "/api/v2/remote/ime", (String) null, t).body).getBoolean("active"));
    }

    @Test
    public void needsAPairedDevice() throws Exception {
        assertEquals(401, req("GET", "/api/v2/remote/ime", (String) null, null).code);
    }

    @Test
    public void webSocketAnswersWithTheSameState() throws Exception {
        String t = pair();
        ApiV2 api = new ApiV2(host, pairing, server);
        JSONObject st = new JSONObject(api.handleWs("{\"t\":\"ime\",\"id\":\"7\"}", "test"));
        assertEquals("ime", st.getString("t"));
        assertEquals("7", st.getString("id"));
        assertFalse(st.getBoolean("active"));
        host.remote().key("search");
        assertTrue(new JSONObject(api.handleWs("{\"t\":\"ime\",\"id\":\"8\"}", "test")).getBoolean("active"));
    }
}
