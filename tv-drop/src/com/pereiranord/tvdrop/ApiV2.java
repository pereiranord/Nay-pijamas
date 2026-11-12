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
 *   POST /api/v2/remote/hold          {"key","on"}  hold a key: the TV repeats it until on=false (continuous action)
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
 *   GET  /api/v2/queue                fila: items, current, repeat, active
 *   POST /api/v2/queue/add            {"src","title","mode":"end|next|now"}  src = URL ou "inbox:<arquivo>"
 *   POST /api/v2/queue/remove|move|clear|play|next|prev|repeat
 *   GET  /api/v2/playlists            POST /api/v2/playlists/save|load|delete {"name"}
 *   GET  /api/v2/history              POST /api/v2/history/play {"src","resume"} | favorite | clear | enabled
 *   GET  /api/v2/player/tracks        POST /api/v2/player/track {"type","group","track"} | speed {"speed"}
 *   GET  /api/v2/timer                POST /api/v2/timer {"minutes","action"} | /api/v2/timer/cancel
 *   GET  /api/v2/storage              disks, received files by type, largest files, TV Drop cache
 *   GET  /api/v2/storage/apps         size of each app (needs usage access on the TV)
 *   POST /api/v2/storage/delete       {"files":[names]}   POST /api/v2/storage/cache   POST /api/v2/apps/settings {"pkg"}
 *   GET  /api/v2/thumb?src=           JPEG thumbnail (accepts ?token=)    GET /api/v2/media/info?src= {duration}
 *   GET  /api/v2/media/now            what another app is playing; GET /api/v2/media/art; POST /api/v2/media/control {action,ms}
 *   GET  /api/v2/screenshot           JPEG of the TV screen (accepts ?token=)
 *   POST /api/v2/slideshow            {"files":[..],"seconds","music"}  POST /api/v2/slideshow/stop
 *   POST /api/v2/present {"file"}     GET /api/v2/present   POST /api/v2/present/control {action,page}   GET /api/v2/present/page?page=
 *   POST /api/v2/player/subtitle {"file"}   POST /api/v2/subtitles/search {query,key,lang}   POST /api/v2/subtitles/download {fileId,key,name}
 *   POST /api/v2/queue/shuffle
 *   POST /api/v2/mirror/stop          ends screen mirroring (stream itself: TCP 8100, see MirrorProtocol)
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
            if (get && "/storage".equals(p)) { Http.json(out, 200, storage()); return; }
            if (get && "/thumb".equals(p)) { thumb(r); return; }
            if (get && "/media/info".equals(p)) {
                String path = resolve(validSrcOrNull(r.query.get("src")));
                long d = path == null ? -1 : durations.computeIfAbsent(path, host::mediaDuration);
                Http.json(out, 200, new JSONObject().put("ok", true).put("duration", d));
                return;
            }
            if (get && "/media/now".equals(p)) {
                JSONObject m = host.externalMedia();
                Http.json(out, 200, (m == null ? new JSONObject().put("available", false) : m).put("ok", true));
                return;
            }
            if (get && "/media/art".equals(p)) { image(out, host.externalArt(), "image/png", "Sem capa"); return; }
            if (get && "/screenshot".equals(p)) {
                byte[] img = host.screenshot();
                if (img == null) Http.error(out, 409, "unavailable", "Captura indisponível: precisa da acessibilidade do TV Drop ativada e Android 11 ou mais novo. Conteúdo protegido (Netflix etc.) aparece preto.");
                else Http.send(out, 200, "image/jpeg", img);
                return;
            }
            if (get && "/present".equals(p)) {
                JSONObject st = host.presentState();
                Http.json(out, 200, (st == null ? new JSONObject().put("active", false) : st.put("active", true)).put("ok", true));
                return;
            }
            if (get && "/present/page".equals(p)) {
                int pg;
                try { pg = Integer.parseInt(r.query.getOrDefault("page", "0")); } catch (NumberFormatException e) { pg = 0; }
                image(out, host.presentPage(pg), "image/jpeg", "Nenhuma apresentação aberta");
                return;
            }
            if (get && "/storage/apps".equals(p)) { Http.json(out, 200, host.appSizes().put("ok", true)); return; }
            if (get && "/queue".equals(p)) { Http.json(out, 200, server.library.queueJson().put("ok", true)); return; }
            if (get && "/playlists".equals(p)) { Http.json(out, 200, server.library.playlistsJson().put("ok", true)); return; }
            if (get && "/history".equals(p)) { Http.json(out, 200, server.library.historyJson().put("ok", true)); return; }
            if (get && "/timer".equals(p)) { Http.json(out, 200, server.timer.state().put("ok", true)); return; }
            if (get && "/player/tracks".equals(p)) {
                JSONObject t = host.playerTracks();
                if (t == null) Http.error(out, 409, "not_playing", "Nada tocando no TV Drop agora.");
                else Http.json(out, 200, t.put("ok", true));
                return;
            }
            if (post && "/speed".equals(p)) { speedUp(r); return; }
            if (!post) { Http.error(out, 404, "not_found", "Rota não encontrada"); return; }

            JSONObject body = r.json();
            if (p.startsWith("/media/") || p.startsWith("/slideshow") || p.startsWith("/present") || p.startsWith("/subtitles/")
                    || "/player/subtitle".equals(p)) {
                mediaRoute(out, p, body);
                return;
            }
            if (p.startsWith("/queue/") || p.startsWith("/playlists/") || p.startsWith("/history/")
                    || p.startsWith("/player/") || p.startsWith("/timer")) {
                library(out, p, body);
                return;
            }
            switch (p) {
                case "/remote/key": done(out, host.remote().key(body.optString("key")), "OK"); return;
                case "/remote/hold": {
                    String owner = "http:" + Pairing.sha256(String.valueOf(r.token())).substring(0, 12);
                    String k = body.optString("key");
                    if (Keys.get(k) == null) { Http.error(out, 409, "unavailable", "Tecla desconhecida: " + k); return; }
                    if (body.optBoolean("on", true)) done(out, server.repeater.start(owner, k), "Segurando " + k);
                    else { server.repeater.stop(owner, k); Http.ok(out, "Solto"); }
                    return;
                }
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
                case "/storage/cache": {
                    long freed = host.clearOwnCache();
                    Http.json(out, 200, new JSONObject().put("ok", true).put("freed", freed).put("message", "Cache do TV Drop limpo"));
                    return;
                }
                case "/storage/delete": {
                    JSONArray names = body.optJSONArray("files");
                    if (names == null || names.length() == 0) { Http.fail(out, "Nenhum arquivo escolhido"); return; }
                    int deleted = 0;
                    long freed = 0;
                    for (int i = 0; i < names.length() && i < 500; i++) {
                        java.io.File f = server.existing(names.optString(i));
                        if (f == null) continue;
                        long len = f.length();
                        if (f.delete()) { deleted++; freed += len; }
                    }
                    Events.add("Armazenamento: " + deleted + " arquivo(s) apagado(s)");
                    Http.json(out, 200, new JSONObject().put("ok", true).put("deleted", deleted).put("freed", freed)
                            .put("message", deleted + " arquivo(s) apagado(s)"));
                    return;
                }
                case "/apps/settings": {
                    String pkg = body.optString("pkg");
                    if (!pkg.matches("[A-Za-z0-9_.]+")) { Http.fail(out, "Pacote inválido"); return; }
                    if (host.openAppSettings(pkg)) Http.ok(out, "Ajustes do app abertos na TV");
                    else Http.error(out, 409, "unavailable", "A TV não abriu os ajustes do app");
                    return;
                }
                case "/mirror/stop":
                    if (host.mirrorStop()) Http.ok(out, "Espelhamento encerrado");
                    else Http.error(out, 409, "not_mirroring", "Nenhum espelhamento ativo");
                    return;
                default: Http.error(out, 404, "not_found", "Rota não encontrada");
            }
        } catch (JSONException e) {
            Http.error(out, 500, "internal", e.getMessage());
        }
    }

    // ---- queue, playlists, history, player, timer ----

    private void library(OutputStream out, String p, JSONObject b) throws IOException, JSONException {
        Library lib = server.library;
        try {
            switch (p) {
                case "/queue/add": {
                    String src = validSrc(b.optString("src"));
                    if (src == null) { Http.fail(out, "Link ou arquivo inválido"); return; }
                    String mode = b.optString("mode", "end");
                    int at = lib.add(new Library.Item(src, b.optString("title")), mode);
                    if ("now".equals(mode)) playItem(lib.play(at));
                    Http.json(out, 200, lib.queueJson().put("ok", true).put("message", "now".equals(mode) ? "Tocando agora" : "Adicionado à fila"));
                    return;
                }
                case "/queue/remove": queueResult(out, lib.remove(b.optInt("index", -1)), "Removido da fila"); return;
                case "/queue/move": queueResult(out, lib.move(b.optInt("from", -1), b.optInt("to", -1)), "Fila reorganizada"); return;
                case "/queue/clear": lib.clear(); queueResult(out, true, "Fila limpa"); return;
                case "/queue/shuffle": lib.shuffle(new java.util.Random()); queueResult(out, true, "Fila embaralhada"); return;
                case "/queue/repeat": lib.setRepeat(b.optString("mode", "off")); queueResult(out, true, "Repetição alterada"); return;
                case "/queue/play": queuePlay(out, lib.play(b.optInt("index", -1))); return;
                case "/queue/next": queuePlay(out, lib.next(false)); return;
                case "/queue/prev": queuePlay(out, lib.previous()); return;
                case "/playlists/save": lib.saveQueueAs(b.optString("name")); Http.json(out, 200, lib.playlistsJson().put("ok", true).put("message", "Playlist salva")); return;
                case "/playlists/load": {
                    if (!lib.loadPlaylist(b.optString("name"))) { Http.error(out, 404, "not_found", "Playlist não encontrada"); return; }
                    if (b.optBoolean("play")) playItem(lib.play(0));
                    queueResult(out, true, "Playlist carregada na fila");
                    return;
                }
                case "/playlists/delete":
                    if (lib.deletePlaylist(b.optString("name"))) Http.json(out, 200, lib.playlistsJson().put("ok", true).put("message", "Playlist apagada"));
                    else Http.error(out, 404, "not_found", "Playlist não encontrada");
                    return;
                case "/history/play": {
                    String src = validSrc(b.optString("src"));
                    if (src == null) { Http.fail(out, "Item inválido"); return; }
                    long start = b.optBoolean("resume") ? lib.resumePosition(src) : 0;
                    lib.setQueueActive(false);
                    String path = resolve(src);
                    if (path == null) { Http.error(out, 404, "not_found", "O arquivo não está mais na TV"); return; }
                    host.play(path, start);
                    Http.ok(out, start > 0 ? "Continuando de onde parou" : "Tocando na TV");
                    return;
                }
                case "/history/favorite": {
                    boolean fav = lib.toggleFavorite(b.optString("src"));
                    Http.json(out, 200, new JSONObject().put("ok", true).put("favorite", fav));
                    return;
                }
                case "/history/clear": lib.clearHistory(); Http.ok(out, "Histórico apagado"); return;
                case "/history/enabled": lib.setHistoryEnabled(b.optBoolean("enabled", true)); Http.ok(out, "Ajuste salvo"); return;
                case "/player/track":
                    done(out, host.playerSelectTrack(b.optString("type"), b.optInt("group", -1), b.optInt("track", -1))
                            ? null : "Não foi possível trocar a faixa.", "Faixa alterada");
                    return;
                case "/player/speed": {
                    double sp = b.optDouble("speed", 1);
                    if (sp < 0.25 || sp > 3) { Http.fail(out, "Velocidade de 0,25x a 3x"); return; }
                    done(out, host.playerSpeed((float) sp) ? null : "Nada tocando no TV Drop agora.", "Velocidade " + sp + "x");
                    return;
                }
                case "/timer":
                    server.timer.set(b.optLong("minutes", 0), b.optString("action", "pause"));
                    Events.add("Temporizador: " + b.optString("action", "pause") + " em " + b.optLong("minutes") + " min");
                    Http.json(out, 200, server.timer.state().put("ok", true).put("message", "Temporizador ativado"));
                    return;
                case "/timer/cancel":
                    server.timer.cancel();
                    Http.json(out, 200, server.timer.state().put("ok", true).put("message", "Temporizador cancelado"));
                    return;
                default: Http.error(out, 404, "not_found", "Rota não encontrada");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            Http.fail(out, e.getMessage());
        }
    }

    private void queueResult(OutputStream out, boolean ok, String msg) throws IOException, JSONException {
        if (!ok) { Http.error(out, 404, "not_found", "Item não encontrado na fila"); return; }
        Http.json(out, 200, server.library.queueJson().put("ok", true).put("message", msg));
    }

    private void queuePlay(OutputStream out, Library.Item item) throws IOException, JSONException {
        if (item == null) { Http.error(out, 404, "not_found", "Não há item para tocar"); return; }
        if (!playItem(item)) { Http.error(out, 404, "not_found", "O arquivo não está mais na TV"); return; }
        Http.json(out, 200, server.library.queueJson().put("ok", true).put("message", "Tocando: " + item.title));
    }

    private boolean playItem(Library.Item item) {
        if (item == null) return false;
        String path = resolve(item.src);
        if (path == null) return false;
        host.play(path);
        return true;
    }

    // ---- media extras ----

    private final java.util.Map<String, Long> durations = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Map<String, byte[]> thumbs = java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<String, byte[]>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(java.util.Map.Entry<String, byte[]> e) {
            return size() > 80;
        }
    });

    private String validSrcOrNull(String s) {
        return s == null ? null : validSrc(s);
    }

    private void thumb(Http.Request r) throws IOException {
        String src = validSrcOrNull(r.query.get("src"));
        String path = src == null ? null : resolve(src);
        if (path == null) { Http.fail(r.out, "Item inválido"); return; }
        byte[] img = thumbs.get(path);
        if (img == null) {
            img = host.thumbnail(path);
            if (img != null) thumbs.put(path, img);
        }
        image(r.out, img, "image/jpeg", "Sem miniatura");
    }

    private static void image(OutputStream out, byte[] img, String type, String missing) throws IOException {
        if (img == null) Http.error(out, 404, "not_found", missing);
        else Http.send(out, 200, type, img, "Cache-Control: private, max-age=600\r\n");
    }

    private java.io.File inboxFile(String name) {
        return name == null ? null : server.existing(name);
    }

    private void mediaRoute(OutputStream out, String p, JSONObject b) throws IOException, JSONException {
        switch (p) {
            case "/media/control": {
                String a = b.optString("action");
                if (!a.matches("play|pause|toggle|next|prev|seek")) { Http.fail(out, "Ação inválida"); return; }
                done(out, host.externalControl(a, b.optLong("ms")) ? null : "Nenhum app está tocando mídia agora (ou o acesso às notificações está desligado).", "OK");
                return;
            }
            case "/slideshow": {
                JSONArray names = b.optJSONArray("files");
                java.util.List<String> paths = new java.util.ArrayList<>();
                if (names != null) for (int i = 0; i < names.length(); i++) {
                    java.io.File f = inboxFile(names.optString(i));
                    if (f != null && "image".equals(HttpServer.kind(f.getName()))) paths.add(f.getAbsolutePath());
                }
                if (paths.isEmpty()) { Http.fail(out, "Escolha pelo menos uma foto recebida"); return; }
                int secs = Math.max(2, Math.min(60, b.optInt("seconds", 6)));
                java.io.File music = inboxFile(b.optString("music", null));
                String music_ = music != null && "audio".equals(HttpServer.kind(music.getName())) ? music.getAbsolutePath() : null;
                done(out, host.slideshow(paths, secs, music_), "Slideshow com " + paths.size() + " foto(s) na TV");
                return;
            }
            case "/slideshow/stop": done(out, host.slideshowStop() ? null : "Nenhum slideshow aberto", "Slideshow encerrado"); return;
            case "/present": {
                java.io.File f = inboxFile(b.optString("file"));
                if (f == null || !f.getName().toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) { Http.fail(out, "Escolha um PDF recebido"); return; }
                String err = host.present(f.getAbsolutePath());
                if (err != null) { Http.error(out, 409, "unavailable", err); return; }
                JSONObject st = host.presentState();
                Http.json(out, 200, (st == null ? new JSONObject() : st).put("ok", true).put("active", true).put("message", "Apresentação aberta na TV"));
                return;
            }
            case "/present/control": {
                String a = b.optString("action");
                if (!a.matches("next|prev|goto|stop")) { Http.fail(out, "Ação inválida"); return; }
                JSONObject st = host.presentControl(a, b.optInt("page", 0));
                if (st == null && !"stop".equals(a)) { Http.error(out, 409, "unavailable", "Nenhuma apresentação aberta"); return; }
                Http.json(out, 200, (st == null ? new JSONObject().put("active", false) : st.put("active", true)).put("ok", true));
                return;
            }
            case "/player/subtitle": {
                java.io.File f = inboxFile(b.optString("file"));
                if (f == null || !f.getName().toLowerCase(java.util.Locale.ROOT).matches(".*\\.(srt|vtt|ass|ssa)$")) { Http.fail(out, "Escolha um arquivo de legenda (.srt ou .vtt)"); return; }
                done(out, host.playerSubtitle(f.getAbsolutePath()) ? null : "Nada tocando no TV Drop agora.", "Legenda carregada");
                return;
            }
            case "/subtitles/search": {
                String q = b.optString("query").trim();
                if (q.isEmpty()) { Http.fail(out, "Digite o nome do filme ou série"); return; }
                try {
                    JSONArray res = new Subtitles(subtitlesBase, b.optString("key")).search(q, b.optString("lang", "pt-br,pt"));
                    Http.json(out, 200, new JSONObject().put("ok", true).put("results", res));
                } catch (IOException e) {
                    Http.error(out, 409, "unavailable", e.getMessage());
                }
                return;
            }
            case "/subtitles/download": {
                try {
                    String base = b.optString("name", "legenda").replaceAll("\\.(srt|vtt)$", "");
                    java.io.File f = new Subtitles(subtitlesBase, b.optString("key")).download(b.optLong("fileId"), host.inbox(), base);
                    boolean attached = b.optBoolean("attach", true) && host.playerSubtitle(f.getAbsolutePath());
                    Events.add("Legenda baixada: " + f.getName());
                    Http.json(out, 200, new JSONObject().put("ok", true).put("file", f.getName()).put("attached", attached)
                            .put("message", attached ? "Legenda baixada e carregada no player" : "Legenda baixada (em Arquivos recebidos)"));
                } catch (IOException e) {
                    Http.error(out, 409, "unavailable", e.getMessage());
                }
                return;
            }
            default: Http.error(out, 404, "not_found", "Rota não encontrada");
        }
    }

    /** Tests point the subtitles client at a fake server. */
    String subtitlesBase = Subtitles.DEFAULT_BASE;

    /** Accepts http(s)/rtsp URLs and "inbox:<received file>". */
    String validSrc(String src) {
        if (src == null) return null;
        String s = src.trim();
        if (s.matches("(?i)^(https?|rtsp|rtmp)://\\S+$")) return s;
        if (s.startsWith("inbox:")) {
            String n = HttpServer.safeName(s.substring(6));
            return n == null ? null : "inbox:" + n;
        }
        return null;
    }

    /** What the player should open for a src (null when an inbox file is gone). */
    String resolve(String src) {
        if (!src.startsWith("inbox:")) return src;
        java.io.File f = server.existing(src.substring(6));
        return f == null ? null : f.getAbsolutePath();
    }

    /** Runs a sleep-timer action on the TV. */
    static void timerAction(TvHost host, String what) {
        Events.add("Temporizador: " + what);
        switch (what) {
            case "pause":
                if (!host.playerControl("pause", 0)) host.remote().key("pause");
                break;
            case "mute":
                host.volume("mute");
                break;
            case "power":
                if (host.remote().key("power") == null) break;
                Events.add("Não foi possível desligar a TV (pareie o controle). Encerrando a reprodução.");
                // fall through
            default:
                if (!host.playerControl("stop", 0)) host.remote().key("stop");
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
                .put("beep", true)
                .put("mirror", new JSONObject().put("active", host.mirrorActive()).put("port", MirrorProtocol.PORT))
                .put("storage", storageHealth())
                .put("screenshot", host.sdk() >= 30 && c.optJSONObject("accessibility") != null && c.optJSONObject("accessibility").optBoolean("enabled"));
    }

    /** Low-space warning: below 1 GB or 5% free on the internal storage. */
    JSONObject storageHealth() throws JSONException {
        long free = host.freeSpace();
        long total = 0;
        JSONArray vols = host.storageVolumes();
        if (vols.length() > 0) total = vols.getJSONObject(0).optLong("total");
        boolean low = free >= 0 && (free < (1L << 30) || (total > 0 && free < total / 20));
        return new JSONObject().put("free", free).put("total", total).put("low", low);
    }

    // ---- storage ----

    /** Disks, received files by type, the largest ones, and TV Drop's own cache. */
    JSONObject storage() throws JSONException {
        JSONObject byKind = new JSONObject();
        long total = 0;
        int count = 0;
        java.util.List<java.io.File> files = new java.util.ArrayList<>();
        java.io.File[] list = host.inbox().listFiles();
        if (list != null) for (java.io.File f : list) if (f.isFile()) files.add(f);
        for (java.io.File f : files) {
            String k = HttpServer.kind(f.getName());
            JSONObject e = byKind.optJSONObject(k);
            if (e == null) { e = new JSONObject().put("bytes", 0L).put("count", 0); byKind.put(k, e); }
            e.put("bytes", e.getLong("bytes") + f.length()).put("count", e.getInt("count") + 1);
            total += f.length();
            count++;
        }
        files.sort((a, b) -> Long.compare(b.length(), a.length()));
        JSONArray largest = new JSONArray();
        for (int i = 0; i < Math.min(15, files.size()); i++) {
            java.io.File f = files.get(i);
            largest.put(new JSONObject().put("name", f.getName()).put("size", f.length())
                    .put("kind", HttpServer.kind(f.getName())).put("modified", f.lastModified()));
        }
        return new JSONObject().put("ok", true)
                .put("volumes", host.storageVolumes())
                .put("inbox", new JSONObject().put("bytes", total).put("count", count).put("byKind", byKind).put("largest", largest));
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
                + "\r\nCache-Control: no-store\r\n" + Http.CORS + "Connection: close\r\n\r\n";
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
        String owner = "ws:" + System.identityHashCode(ws) + ":" + System.nanoTime();
        try {
            String msg;
            while ((msg = ws.receive()) != null) {
                String reply = handleWs(msg, owner);
                if (reply != null) ws.sendText(reply);
            }
        } finally {
            server.repeater.stopAll(owner); // never leave a key held when the phone goes away
        }
    }

    /** Handles one WebSocket message; returns the reply, or null when none is due (pointer moves). */
    String handleWs(String msg, String owner) {
        try {
            JSONObject m = new JSONObject(msg);
            String t = m.optString("t");
            String id = m.optString("id", null);
            String err;
            switch (t) {
                case "key": err = host.remote().key(m.optString("k")); break;
                case "hold": {
                    String k = m.optString("k");
                    if (Keys.get(k) == null) { err = "Tecla desconhecida: " + k; break; }
                    if (m.optBoolean("on", true)) err = server.repeater.start(owner, k);
                    else { server.repeater.stop(owner, k); err = null; }
                    break;
                }
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
