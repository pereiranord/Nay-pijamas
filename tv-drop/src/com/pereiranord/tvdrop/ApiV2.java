package com.pereiranord.tvdrop;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * TV Drop 2.0 API. All responses are JSON: {"ok":true,...} or {"ok":false,"error":..,"message":..}.
 *
 *   GET  /api/v2/info                 who this TV is (no token needed)
 *   POST /api/v2/pair                 {"pin","name"} -> {"token","device"} (no token needed)
 *   GET  /api/v2/session              the device this token belongs to
 *   GET  /api/v2/capabilities         what this TV can do right now, and through which path
 *   POST /api/v2/remote/key           {"key":"up"}           (see Keys)
 *   POST /api/v2/remote/text          {"text","replace","submit"}
 *   POST /api/v2/remote/pointer       {"action":"move|tap|longpress|scroll|hide","dx","dy"}
 *   POST /api/v2/remote/link          {"link"}               open a link/app link on the TV
 *   POST /api/v2/remote/pair/start    start pairing with the TV's remote service (code appears on TV)
 *   POST /api/v2/remote/pair/finish   {"code"}
 *   POST /api/v2/remote/unpair
 *   POST /api/v2/volume               {"action":"up|down|mute"}
 *   GET  /api/v2/apps                 installed apps + streaming catalog
 *   GET  /api/v2/apps/icon?pkg=       PNG (accepts ?token=)
 *   POST /api/v2/apps/launch          {"pkg"}
 *   POST /api/v2/apps/uninstall       {"pkg"}   (the TV asks for confirmation)
 *   POST /api/v2/apps/store           {"pkg"}   open the app's store page on the TV
 *   GET  /api/v2/devices              paired devices
 *   POST /api/v2/devices/revoke       {"id"}
 *   POST /api/v2/devices/rename       {"id","name"}
 *   POST /api/v2/settings             {"legacyOpen":bool}
 *   POST /api/v2/beep                 play a sound on the TV ("Encontrar minha TV")
 *   GET  /api/v2/ping                 round-trip test
 *   GET  /api/v2/speed?bytes=         download test (bytes of zeros)
 *   POST /api/v2/speed                upload test (body discarded)
 *   GET  /api/v2/ws?token=            WebSocket: {"t":"key","k":..} {"t":"move","dx","dy"} {"t":"tap"} {"t":"scroll","dy"} ...
 */
final class ApiV2 {
    static final int API_VERSION = 2;
    private final TvHost host;
    private final Pairing pairing;
    private final HttpServer server;
    private final Map<String, byte[]> iconCache = new HashMap<>();

    ApiV2(TvHost host, Pairing pairing, HttpServer server) {
        this.host = host;
        this.pairing = pairing;
        this.server = server;
    }

    void route(Http.Request r, Socket s) throws IOException {
        OutputStream out = r.out;
        String p = r.path.substring("/api/v2".length());
        boolean get = "GET".equals(r.method), post = "POST".equals(r.method);
        try {
            if (get && "/info".equals(p)) { Http.json(out, 200, info()); return; }
            if (post && "/pair".equals(p)) { pair(r); return; }
            if (get && "/ws".equals(p)) { webSocket(r, s); return; }
            if (get && "/session".equals(p)) {
                Pairing.Device d = pairing.check(r.token());
                Http.json(out, 200, new JSONObject().put("ok", true).put("device", d == null ? null : d.toJson()));
                return;
            }
            if (get && "/capabilities".equals(p)) { Http.json(out, 200, capabilities()); return; }
            if (get && "/apps".equals(p)) { Http.json(out, 200, apps()); return; }
            if (get && "/apps/icon".equals(p)) { icon(r); return; }
            if (get && "/devices".equals(p)) { Http.json(out, 200, devices(r)); return; }
            if (get && "/ping".equals(p)) {
                Http.json(out, 200, new JSONObject().put("ok", true).put("t", System.currentTimeMillis()));
                return;
            }
            if (get && "/speed".equals(p)) { speedDown(r); return; }
            if (post && "/speed".equals(p)) { speedUp(r); return; }
            if (!post) { Http.error(out, 404, "not_found", "Rota não encontrada"); return; }

            JSONObject body = r.json();
            switch (p) {
                case "/remote/key": done(out, host.remote().key(body.optString("key")), "OK"); return;
                case "/remote/text": {
                    String text = body.optString("text", "");
                    if (text.length() > 500) { Http.fail(out, "Texto grande demais (máx. 500)"); return; }
                    done(out, host.remote().text(text, body.optBoolean("replace"), body.optBoolean("submit")), "Texto enviado");
                    return;
                }
                case "/remote/pointer":
                    done(out, host.remote().pointer(body.optString("action", "move"),
                            (float) body.optDouble("dx", 0), (float) body.optDouble("dy", 0)), "OK");
                    return;
                case "/remote/link": {
                    String link = body.optString("link", "").trim();
                    if (!link.matches("(?i)^(https?|market)://\\S+$")) {
                        Http.fail(out, "Link inválido");
                        return;
                    }
                    done(out, host.remote().launchLink(link), "Abrindo na TV");
                    return;
                }
                case "/remote/pair/start":
                    done(out, host.remote().pairStart(), "Um código apareceu na tela da TV. Digite-o aqui.");
                    return;
                case "/remote/pair/finish":
                    done(out, host.remote().pairFinish(body.optString("code")), "Controle pareado com a TV");
                    return;
                case "/remote/unpair": done(out, host.remote().unpair(), "Pareamento do controle removido"); return;
                case "/volume": {
                    String a = body.optString("action");
                    if (!a.matches("up|down|mute")) { Http.fail(out, "Ação de volume inválida"); return; }
                    host.volume(a);
                    Http.ok(out, "OK");
                    return;
                }
                case "/apps/launch": appAction(out, body.optString("pkg"), "launch"); return;
                case "/apps/uninstall": appAction(out, body.optString("pkg"), "uninstall"); return;
                case "/apps/store": appAction(out, body.optString("pkg"), "store"); return;
                case "/devices/revoke": {
                    boolean ok = pairing.revoke(body.optString("id"));
                    if (ok) Http.ok(out, "Aparelho removido"); else Http.error(out, 404, "not_found", "Aparelho não encontrado");
                    return;
                }
                case "/devices/rename": {
                    boolean ok = pairing.rename(body.optString("id"), body.optString("name"));
                    if (ok) Http.ok(out, "Nome alterado"); else Http.error(out, 404, "not_found", "Aparelho não encontrado");
                    return;
                }
                case "/settings": {
                    if (body.has("legacyOpen")) pairing.setLegacyOpen(body.optBoolean("legacyOpen"));
                    Http.json(out, 200, new JSONObject().put("ok", true).put("legacyOpen", pairing.legacyOpen()));
                    return;
                }
                case "/beep": host.beep(); Http.ok(out, "A TV está tocando um som"); return;
                default: Http.error(out, 404, "not_found", "Rota não encontrada");
            }
        } catch (JSONException e) {
            Http.error(out, 500, "internal", e.getMessage());
        }
    }

    private static void done(OutputStream out, String err, String okMessage) throws IOException {
        if (err == null) Http.ok(out, okMessage);
        else Http.error(out, 409, "unavailable", err);
    }

    // ---- info, pairing ----

    JSONObject info() throws JSONException {
        return new JSONObject()
                .put("ok", true)
                .put("app", "tvdrop")
                .put("api", API_VERSION)
                .put("version", host.appVersion())
                .put("name", server.tvName())
                .put("model", host.model())
                .put("android", host.androidRelease())
                .put("sdk", host.sdk())
                .put("code", server.code())
                .put("requiresPairing", true)
                .put("legacyOpen", pairing.legacyOpen());
    }

    private void pair(Http.Request r) throws IOException, JSONException {
        JSONObject b = r.json();
        try {
            Pairing.Result res = pairing.pair(b.optString("pin"), b.optString("name", "Aparelho"));
            Events.add("Novo aparelho pareado: " + res.device.name);
            Http.json(r.out, 200, new JSONObject().put("ok", true).put("token", res.token).put("device", res.device.toJson()));
        } catch (Pairing.Refused e) {
            Http.error(r.out, 403, "bad_pin", e.getMessage());
        }
    }

    private JSONObject devices(Http.Request r) throws JSONException {
        Pairing.Device me = pairing.check(r.token());
        JSONArray a = new JSONArray();
        for (Pairing.Device d : pairing.devices()) a.put(d.toJson().put("current", me != null && me.id.equals(d.id)));
        return new JSONObject().put("ok", true).put("devices", a).put("legacyOpen", pairing.legacyOpen());
    }

    // ---- capabilities ----

    JSONObject capabilities() throws JSONException {
        JSONObject c = host.remote().capabilities();
        return new JSONObject()
                .put("ok", true)
                .put("api", API_VERSION)
                .put("sdk", host.sdk())
                .put("android", host.androidRelease())
                .put("remote", c)
                .put("apps", new JSONObject().put("list", true).put("launch", true).put("uninstall", true))
                .put("volume", true)
                .put("player", new JSONObject()
                        .put("controls", true).put("seek", true).put("external", host.externalPlayerName() != null
                                && !host.externalPlayerName().isEmpty()))
                .put("files", new JSONObject().put("upload", true).put("install", host.canInstall()))
                .put("autoOpen", host.canOverlay())
                .put("beep", true);
    }

    // ---- apps ----

    private JSONObject apps() throws JSONException {
        List<TvHost.AppInfo> list = host.apps();
        JSONArray a = new JSONArray();
        for (TvHost.AppInfo app : list) {
            a.put(new JSONObject().put("pkg", app.pkg).put("label", app.label).put("system", app.system));
        }
        return new JSONObject().put("ok", true).put("apps", a).put("catalog", AppCatalog.match(list));
    }

    private void icon(Http.Request r) throws IOException {
        String pkg = r.query.get("pkg");
        if (pkg == null || !pkg.matches("[A-Za-z0-9_.]+")) { Http.fail(r.out, "Pacote inválido"); return; }
        byte[] png;
        synchronized (iconCache) {
            png = iconCache.get(pkg);
        }
        if (png == null) {
            png = host.appIcon(pkg);
            if (png != null) synchronized (iconCache) { iconCache.put(pkg, png); }
        }
        if (png == null) { Http.error(r.out, 404, "not_found", "Sem ícone"); return; }
        Http.send(r.out, 200, "image/png", png, "Cache-Control: private, max-age=86400\r\n");
    }

    private void appAction(OutputStream out, String pkg, String action) throws IOException {
        if (pkg == null || !pkg.matches("[A-Za-z0-9_.]+")) { Http.fail(out, "Pacote inválido"); return; }
        boolean installed = false;
        for (TvHost.AppInfo a : host.apps()) if (a.pkg.equals(pkg)) installed = true;
        switch (action) {
            case "launch":
                if (!installed) { Http.error(out, 404, "not_installed", "Este app não está instalado na TV"); return; }
                if (host.launchApp(pkg)) Http.ok(out, "Abrindo na TV");
                else Http.error(out, 409, "unavailable", "A TV não deixou abrir o app. Deixe o TV Drop aberto ou libere \"Sobrepor a outros apps\".");
                return;
            case "uninstall":
                if (!installed) { Http.error(out, 404, "not_installed", "Este app não está instalado na TV"); return; }
                if (host.uninstallApp(pkg)) Http.ok(out, "Confirme a desinstalação na TV");
                else Http.error(out, 409, "unavailable", "A TV não abriu a tela de desinstalação.");
                return;
            default:
                if (host.openStorePage(pkg)) Http.ok(out, "Abrindo a loja na TV");
                else Http.error(out, 409, "unavailable", "Não há loja de apps disponível na TV.");
        }
    }

    // ---- diagnostics ----

    private void speedDown(Http.Request r) throws IOException {
        long n;
        try {
            n = Long.parseLong(r.query.getOrDefault("bytes", "4000000"));
        } catch (NumberFormatException e) {
            n = 4_000_000;
        }
        n = Math.max(1, Math.min(n, 64L << 20));
        String head = "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: " + n
                + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        r.out.write(head.getBytes(StandardCharsets.US_ASCII));
        byte[] zeros = new byte[64 * 1024];
        long left = n;
        while (left > 0) {
            int k = (int) Math.min(zeros.length, left);
            r.out.write(zeros, 0, k);
            left -= k;
        }
        r.out.flush();
    }

    private void speedUp(Http.Request r) throws IOException {
        long t0 = System.nanoTime();
        InputStream in = r.in;
        byte[] buf = new byte[64 * 1024];
        long got = 0, len = Math.min(r.length, 256L << 20);
        while (got < len) {
            int n = in.read(buf, 0, (int) Math.min(buf.length, len - got));
            if (n < 0) break;
            got += n;
        }
        long ms = Math.max(1, (System.nanoTime() - t0) / 1_000_000);
        try {
            Http.json(r.out, 200, new JSONObject().put("ok", true).put("bytes", got).put("ms", ms));
        } catch (JSONException e) {
            throw new IOException(e);
        }
    }

    // ---- WebSocket: low-latency touchpad and keys ----

    private void webSocket(Http.Request r, Socket s) throws IOException {
        if (!Http.WebSocket.isUpgrade(r)) { Http.fail(r.out, "Esperava uma conexão WebSocket"); return; }
        s.setSoTimeout(0);
        Http.WebSocket ws = Http.WebSocket.accept(r);
        String msg;
        while ((msg = ws.receive()) != null) {
            String reply = handleWs(msg);
            if (reply != null) ws.sendText(reply);
        }
    }

    /** Handles one WebSocket message; returns the reply, or null when none is due (pointer moves). */
    String handleWs(String msg) {
        try {
            JSONObject m = new JSONObject(msg);
            String t = m.optString("t");
            String id = m.optString("id", null);
            String err;
            switch (t) {
                case "key": err = host.remote().key(m.optString("k")); break;
                case "text": err = host.remote().text(m.optString("text"), m.optBoolean("replace"), m.optBoolean("submit")); break;
                case "move": case "tap": case "longpress": case "scroll": case "hide":
                    err = host.remote().pointer(t, (float) m.optDouble("dx", 0), (float) m.optDouble("dy", 0));
                    if ("move".equals(t) && err == null) return null;
                    break;
                case "volume": host.volume(m.optString("action")); err = null; break;
                case "ping": return new JSONObject().put("t", "pong").put("id", id).toString();
                default: err = "Comando desconhecido: " + t;
            }
            JSONObject o = new JSONObject().put("t", "ack").put("ok", err == null);
            if (id != null) o.put("id", id);
            if (err != null) o.put("message", err);
            return o.toString();
        } catch (JSONException e) {
            return "{\"t\":\"ack\",\"ok\":false,\"message\":\"JSON inválido\"}";
        }
    }

    static String lower(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }
}
