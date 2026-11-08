/* Quem Sou Eu? — lógica do jogo */
(function () {
  "use strict";

  const A = window.Android || null; // ponte com o app nativo (ausente no navegador)
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- armazenamento ---------------- */
  const store = {
    get(k, def) {
      try { const v = localStorage.getItem("qse_" + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(k, v) { try { localStorage.setItem("qse_" + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  };

  const DEFAULTS = { time: 60, rounds: 0, dir: "normal", sens: "medium", penalty: false, sound: true, vibrate: true, tap: true, norepeat: true };
  const settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
  let players = store.get("players", []);     // [{name, score, played}]
  let turn = store.get("turn", 0);
  let groups = store.get("groups", []);       // [{name, names:[]}]
  let custom = store.get("custom", []);       // [{id, n, e, c, w:[]}]
  let favs = store.get("favs", []);
  let used = store.get("used", {});           // {catId: [palavras]}
  const save = () => {
    store.set("settings", settings); store.set("players", players); store.set("turn", turn);
    store.set("groups", groups); store.set("custom", custom); store.set("favs", favs); store.set("used", used);
  };

  const COLORS = ["#FF3CAC", "#00C9A7", "#FFB000", "#1E88E5", "#8E24AA", "#F4511E", "#43A047", "#E53935", "#00ACC1", "#6D4C41"];
  const SENS = { high: { trig: 5.5, neutral: 3.5 }, medium: { trig: 7.0, neutral: 4.0 }, low: { trig: 8.3, neutral: 4.6 } };

  /* ---------------- categorias ---------------- */
  const builtin = window.CATEGORIES.map((c) => {
    const seen = new Set();
    const w = c.w.split("|").map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
    return { id: c.id, n: c.n, e: c.e, c: c.c, g: c.g, w };
  });
  const MIX = { id: "mix", n: "Mix de Tudo", e: "🎲", c: "#5B21B6", g: "Especiais", special: true };
  const FAVMIX = { id: "favmix", n: "Mix das Favoritas", e: "⭐", c: "#B45309", g: "Especiais", special: true };

  const allCats = () => custom.map((c) => Object.assign({ g: "Minhas categorias", mine: true }, c)).concat(builtin);
  const findCat = (id) => id === "mix" ? MIX : id === "favmix" ? FAVMIX : allCats().find((c) => c.id === id);

  function wordsOf(cat) {
    if (cat.id === "mix") return allCats().flatMap((c) => c.w.map((w) => ({ w, from: c.e + " " + c.n })));
    if (cat.id === "favmix") {
      const list = allCats().filter((c) => favs.includes(c.id));
      return (list.length ? list : builtin).flatMap((c) => c.w.map((w) => ({ w, from: c.e + " " + c.n })));
    }
    return cat.w.map((w) => ({ w, from: "" }));
  }
  const countOf = (cat) => wordsOf(cat).length;

  /* ---------------- navegação ---------------- */
  const history = [];
  let current = "home";
  function show(name, push = true) {
    if (push && current !== name) history.push(current);
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $("#scr-" + name).classList.add("active");
    const prev = current;
    current = name;
    if (prev === "settings" && name !== "settings") sensorFor("settings", false);
    if (name === "home") renderHome();
    if (name === "players") renderPlayers();
    if (name === "settings") { loadSettingsForm(); sensorFor("settings", true); }
    if (name === "ready") renderReady();
  }
  function back() {
    if (!history.length) { show("home", false); return; }
    let to = history.pop();
    while (to === "game" || to === "result") to = history.length ? history.pop() : "home";
    show(to, false);
  }
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { unlockAudio(); show(go.dataset.go); }
    if (e.target.closest("[data-back]")) back();
  });

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------------- início ---------------- */
  let filter = "all";
  function renderChips() {
    const chips = [["all", "Todas"], ["fav", "⭐ Favoritas"]];
    if (custom.length) chips.push(["mine", "✏️ Minhas"]);
    window.CATEGORY_GROUPS.forEach((g) => chips.push([g, g]));
    $("#chips").innerHTML = chips.map(([k, l]) => `<button class="chip ${filter === k ? "on" : ""}" data-filter="${esc(k)}">${esc(l)}</button>`).join("");
  }
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]"); if (!b) return;
    filter = b.dataset.filter; renderHome();
  });
  $("#search").addEventListener("input", () => renderHome());

  function catCard(c) {
    const fav = favs.includes(c.id);
    return `<div class="cat" style="background:${esc(c.c)}" data-cat="${esc(c.id)}" role="button">
      ${c.special ? "" : `<button class="star" data-fav="${esc(c.id)}">${fav ? "⭐" : "☆"}</button>`}
      ${c.mine ? `<button class="edit" data-edit="${esc(c.id)}">✏️</button>` : ""}
      <span class="em">${esc(c.e)}</span>
      <div><div class="nm">${esc(c.n)}</div><div class="ct">${countOf(c)} palavras</div></div>
    </div>`;
  }

  function renderHome() {
    renderChips();
    const q = $("#search").value.trim().toLowerCase();
    const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let cats = allCats();
    if (filter === "fav") cats = cats.filter((c) => favs.includes(c.id));
    else if (filter === "mine") cats = cats.filter((c) => c.mine);
    else if (filter !== "all") cats = cats.filter((c) => c.g === filter);
    if (q) cats = cats.filter((c) => norm(c.n).includes(norm(q)) || c.w.some((w) => norm(w).includes(norm(q))));

    const total = allCats().reduce((s, c) => s + c.w.length, 0);
    $("#home-sub").textContent = `${allCats().length} categorias · ${total.toLocaleString("pt-BR")} palavras`;

    let html = "";
    if (filter === "all" && !q) {
      html += `<div class="group-title">Especiais</div><div class="grid">${catCard(MIX)}${favs.length ? catCard(FAVMIX) : ""}</div>`;
      const groupsOrder = (custom.length ? ["Minhas categorias"] : []).concat(window.CATEGORY_GROUPS);
      groupsOrder.forEach((g) => {
        const list = cats.filter((c) => c.g === g);
        if (list.length) html += `<div class="group-title">${esc(g)}</div><div class="grid">${list.map(catCard).join("")}</div>`;
      });
    } else if (cats.length) {
      if (filter === "fav" && !q) html += `<div class="grid" style="margin-top:6px">${catCard(FAVMIX)}</div>`;
      html += `<div class="grid" style="margin-top:10px">${cats.map(catCard).join("")}</div>`;
    } else {
      html = `<div class="empty">${filter === "fav" ? "Toque na ☆ de uma categoria para favoritar." : "Nada encontrado 🤷"}</div>`;
    }
    $("#cat-list").innerHTML = html;
    const n = players.length;
    $("#players-badge").textContent = n; $("#players-badge").classList.toggle("hidden", !n);
  }

  $("#cat-list").addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      const id = fav.dataset.fav;
      favs = favs.includes(id) ? favs.filter((x) => x !== id) : favs.concat(id);
      save(); renderHome(); return;
    }
    const ed = e.target.closest("[data-edit]");
    if (ed) { openEditor(ed.dataset.edit); return; }
    const card = e.target.closest("[data-cat]");
    if (card) { unlockAudio(); selectedCat = card.dataset.cat; store.set("lastCat", selectedCat); show("ready"); }
  });

  /* ---------------- preparar rodada ---------------- */
  let selectedCat = store.get("lastCat", "mix");
  const curPlayer = () => (players.length ? players[turn % players.length] : null);

  function dirText() {
    return settings.dir === "normal"
      ? "Acertou: <b>tela para cima ⬆️</b> · Passar: <b>tela para baixo ⬇️</b>"
      : "Acertou: <b>tela para baixo ⬇️</b> · Passar: <b>tela para cima ⬆️</b>";
  }

  function renderReady() {
    const cat = findCat(selectedCat) || MIX;
    selectedCat = cat.id;
    $("#ready-cat").style.background = cat.c;
    $("#ready-cat").innerHTML = `<div class="em">${esc(cat.e)}</div><div class="nm">${esc(cat.n)}</div><div class="ct">${countOf(cat)} palavras</div>`;
    const p = curPlayer();
    if (p) {
      const lim = settings.rounds ? ` · rodada ${Math.min(p.played + 1, settings.rounds)}/${settings.rounds}` : "";
      $("#ready-turn").innerHTML = `É a vez de<b>${esc(p.name)}</b><small>${p.score} pontos${lim}</small>`;
    } else {
      $("#ready-turn").innerHTML = `<small>Modo livre · adicione jogadores para revezar e somar pontos</small>`;
    }
    $("#ready-info").innerHTML = `<span class="pill">⏱️ ${settings.time}s</span>` +
      `<span class="pill">🎯 Sensor ${({ high: "alto", medium: "médio", low: "baixo" })[settings.sens]}</span>` +
      (settings.penalty ? `<span class="pill">➖ Passar tira ponto</span>` : "") +
      (hasSensor() ? "" : `<span class="pill">👆 Sem sensor: use toques</span>`);
    $("#tip-dirs").innerHTML = dirText();
  }
  $("#btn-change-cat").addEventListener("click", () => back());
  $("#btn-start").addEventListener("click", () => { unlockAudio(); startRound(); });

  /* ---------------- sensor ---------------- */
  let lastZ = 0;
  const sensorUsers = new Set();
  function hasSensor() {
    if (A) { try { return A.hasSensor(); } catch (e) { return false; } }
    return "DeviceMotionEvent" in window;
  }
  function sensorFor(who, on) {
    if (on) sensorUsers.add(who); else sensorUsers.delete(who);
    if (A) { try { A.setSensor(sensorUsers.size > 0); } catch (e) { /* ignore */ } }
  }
  if (!A && "DeviceMotionEvent" in window) {
    // Navegador: usa o acelerômetro do próprio navegador
    window.addEventListener("devicemotion", (ev) => {
      const g = ev.accelerationIncludingGravity;
      if (g && g.z != null && sensorUsers.size) window.onTilt(g.z);
    });
  }

  window.onTilt = function (z) {
    lastZ = settings.dir === "invert" ? -z : z;
    if (current === "settings") updateSensorTest(lastZ);
    if (current === "game") gameTilt(lastZ);
  };

  function updateSensorTest(z) {
    const pct = Math.max(0, Math.min(100, 50 + (z / 9.8) * 50));
    $("#sensor-bar").style.left = `calc(${pct}% - 5px)`;
    const s = SENS[settings.sens];
    $("#sensor-text").textContent = z > s.trig ? "✅ ACERTO" : z < -s.trig ? "❌ PASSAR" : Math.abs(z) < s.neutral ? "Em pé (posição neutra)" : "…";
  }

  /* ---------------- áudio & vibração ---------------- */
  let actx = null;
  function unlockAudio() {
    if (!settings.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (e) { actx = null; }
  }
  function tone(freq, dur, type = "sine", vol = 0.25, delay = 0) {
    if (!settings.sound || !actx) return;
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    ok() { tone(660, 0.12, "triangle"); tone(990, 0.22, "triangle", 0.25, 0.1); },
    pass() { tone(220, 0.3, "sawtooth", 0.15); },
    tick() { tone(880, 0.06, "square", 0.08); },
    count() { tone(520, 0.15, "triangle"); },
    go() { tone(1040, 0.35, "triangle", 0.3); },
    end() { tone(300, 0.25, "square", 0.2); tone(200, 0.6, "square", 0.2, 0.25); }
  };
  function buzz(ms) {
    if (!settings.vibrate) return;
    try { if (A) A.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }
  function landscape(on) { if (A) { try { A.setLandscape(on); } catch (e) { /* ignore */ } } }

  /* ---------------- jogo ---------------- */
  const G = { phase: "idle", deck: [], word: null, log: [], endAt: 0, remaining: 0, timer: null, armed: false, locked: false, stableSince: 0, catId: null, committed: true };

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function buildDeck(cat) {
    let words = wordsOf(cat);
    if (settings.norepeat) {
      const u = new Set(used[cat.id] || []);
      let fresh = words.filter((x) => !u.has(x.w));
      if (fresh.length < 8) { used[cat.id] = []; fresh = words; toast("Todas as palavras já saíram — embaralhando de novo!"); }
      words = fresh;
    }
    return shuffle(words.slice());
  }

  function startRound() {
    const cat = findCat(selectedCat) || MIX;
    G.catId = cat.id;
    G.deck = buildDeck(cat);
    G.log = []; G.word = null; G.committed = false;
    G.remaining = settings.time * 1000;
    const p = curPlayer();
    $("#g-player").textContent = p ? p.name : cat.e + " " + cat.n;
    $("#g-score").textContent = "0 ✓";
    $("#g-timer").textContent = settings.time; $("#g-timer").classList.remove("low");
    $("#g-tap").classList.toggle("hidden", !settings.tap);
    show("game");
    landscape(true);
    sensorFor("game", true);
    G.phase = "place"; G.stableSince = 0;
    const sensorOk = hasSensor();
    setWord(sensorOk ? "📱 Coloque na testa" : "Toque para começar",
      sensorOk ? "a rodada começa sozinha quando o celular ficar em pé · ou toque na tela" : "");
    hideFlash();
  }

  function fitWord() {
    const el = $("#g-word"), stage = $("#g-stage");
    const maxW = stage.clientWidth - 40, maxH = stage.clientHeight * 0.8;
    let size = Math.min(window.innerWidth * 0.14, window.innerHeight * 0.32, 140);
    el.style.fontSize = size + "px";
    let guard = 40;
    while ((el.scrollWidth > maxW || el.scrollHeight > maxH) && size > 18 && guard--) {
      size *= 0.9; el.style.fontSize = size + "px";
    }
  }
  function setWord(w, sub) {
    $("#g-word").textContent = w; $("#g-sub").textContent = sub || "";
    requestAnimationFrame(fitWord);
  }
  window.addEventListener("resize", () => { if (current === "game") fitWord(); });

  function flash(cls, html, ms) {
    const f = $("#g-flash");
    f.className = "g-flash show " + cls; f.innerHTML = html;
    clearTimeout(flash._t);
    if (ms) flash._t = setTimeout(hideFlash, ms);
  }
  function hideFlash() { clearTimeout(flash._t); $("#g-flash").className = "g-flash"; }

  function beginCountdown() {
    if (G.phase !== "place") return;
    G.phase = "count";
    let n = 3;
    const stepDown = () => {
      if (G.phase !== "count") return;
      if (n > 0) { flash("count", String(n), 0); sfx.count(); buzz(40); n--; G.cd = setTimeout(stepDown, 850); }
      else { hideFlash(); sfx.go(); buzz(120); play(); }
    };
    stepDown();
  }

  function play() {
    G.phase = "play"; G.armed = true; G.locked = false;
    G.endAt = Date.now() + G.remaining;
    nextWord();
    runTimer();
  }

  function runTimer() {
    clearInterval(G.timer);
    let lastSec = -1;
    G.timer = setInterval(() => {
      G.remaining = Math.max(0, G.endAt - Date.now());
      const sec = Math.ceil(G.remaining / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        $("#g-timer").textContent = sec;
        const low = sec <= 5 && sec > 0;
        $("#g-timer").classList.toggle("low", low);
        if (low) sfx.tick();
      }
      if (G.remaining <= 0) endRound();
    }, 100);
  }

  function nextWord() {
    if (!G.deck.length) { G.deck = buildDeck(findCat(G.catId) || MIX); }
    G.word = G.deck.pop();
    setWord(G.word.w, G.word.from);
  }

  function answer(ok) {
    if (G.phase !== "play" || G.locked || !G.word) return;
    G.locked = true; G.armed = false;
    G.log.push({ w: G.word.w, ok: ok ? "ok" : "no" });
    if (settings.norepeat) { (used[G.catId] = used[G.catId] || []).push(G.word.w); }
    const pts = G.log.filter((x) => x.ok === "ok").length;
    $("#g-score").textContent = pts + " ✓";
    if (ok) { flash("ok", "ACERTOU!<small>" + esc(G.word.w) + "</small>", 0); sfx.ok(); buzz(80); }
    else { flash("no", "PASSOU<small>" + esc(G.word.w) + "</small>", 0); sfx.pass(); buzz(180); }
    G.word = null;
    setTimeout(() => {
      if (G.phase !== "play") return;
      hideFlash(); nextWord(); G.locked = false;
    }, 750);
  }

  function gameTilt(z) {
    const s = SENS[settings.sens];
    const neutral = Math.abs(z) < s.neutral;
    if (G.phase === "place") {
      if (neutral) {
        if (!G.stableSince) G.stableSince = Date.now();
        else if (Date.now() - G.stableSince > 700) beginCountdown();
      } else G.stableSince = 0;
      return;
    }
    if (G.phase !== "play") return;
    if (neutral) { G.armed = true; return; }
    if (!G.armed || G.locked) return;
    if (z > s.trig) answer(true);
    else if (z < -s.trig) answer(false);
  }

  // toques na tela
  function tapHandler(ok) {
    return (e) => {
      e.preventDefault();
      if (G.phase === "place") { beginCountdown(); return; }
      if (settings.tap) answer(ok);
    };
  }
  $("#tap-left").addEventListener("click", tapHandler(false));
  $("#tap-right").addEventListener("click", tapHandler(true));
  $("#scr-game").addEventListener("click", (e) => {
    if (G.phase === "place" && !e.target.closest("#g-pause")) beginCountdown();
  });

  function endRound() {
    if (G.phase !== "play") return;
    clearInterval(G.timer);
    G.phase = "end";
    if (G.word) G.log.push({ w: G.word.w, ok: "skip" });
    G.word = null;
    sfx.end(); buzz(400);
    flash("end", "⏰ TEMPO!", 0);
    save();
    setTimeout(showResult, 1500);
  }

  function stopGameMode() {
    clearInterval(G.timer); clearTimeout(G.cd);
    sensorFor("game", false);
    landscape(false);
    hideFlash();
  }

  /* pausa */
  function pause() {
    if (!["play", "count", "place"].includes(G.phase)) return;
    if (G.phase === "play") { G.remaining = Math.max(0, G.endAt - Date.now()); clearInterval(G.timer); }
    if (G.phase === "count") { clearTimeout(G.cd); hideFlash(); }
    G.pausedFrom = G.phase; G.phase = "paused";
    $("#modal-pause").classList.remove("hidden");
  }
  function resume() {
    $("#modal-pause").classList.add("hidden");
    if (G.phase !== "paused") return;
    if (G.pausedFrom === "play") { G.phase = "play"; G.endAt = Date.now() + G.remaining; G.armed = false; runTimer(); }
    else { G.phase = "place"; G.stableSince = 0; beginCountdown(); }
  }
  $("#g-pause").addEventListener("click", (e) => { e.stopPropagation(); pause(); });
  $("#btn-resume").addEventListener("click", resume);
  $("#btn-end-round").addEventListener("click", () => {
    $("#modal-pause").classList.add("hidden");
    if (G.pausedFrom === "play") { G.phase = "play"; endRound(); }
    else { G.phase = "idle"; stopGameMode(); G.committed = true; show("ready", false); }
  });
  $("#btn-quit").addEventListener("click", () => {
    $("#modal-pause").classList.add("hidden");
    G.phase = "idle"; G.committed = true; stopGameMode(); show("ready", false);
  });

  /* ---------------- resultado ---------------- */
  function roundPoints() {
    const ok = G.log.filter((x) => x.ok === "ok").length;
    const no = G.log.filter((x) => x.ok === "no").length;
    return { ok, no, pts: Math.max(0, ok - (settings.penalty ? no : 0)) };
  }
  function showResult() {
    stopGameMode();
    G.phase = "result";
    show("result");
    renderResult();
  }
  function renderResult() {
    const r = roundPoints(), p = curPlayer();
    $("#r-player").textContent = p ? p.name : "Resultado";
    $("#r-points").textContent = r.pts;
    $("#r-stats").innerHTML = `<span class="pill">✅ ${r.ok} acertos</span><span class="pill">❌ ${r.no} passadas</span>`;
    $("#r-words").innerHTML = G.log.map((x, i) =>
      `<li class="${x.ok}" data-i="${i}"><span>${esc(x.w)}</span><span>${x.ok === "ok" ? "✅" : x.ok === "no" ? "❌" : "⏰"}</span></li>`).join("")
      || `<li class="skip"><span>Nenhuma palavra</span></li>`;
    const last = p && settings.rounds && players.every((q, idx) => (idx === turn % players.length ? q.played + 1 : q.played) >= settings.rounds);
    const next = players.length ? players[(turn + 1) % players.length] : null;
    $("#btn-r-next").textContent = last ? "🏆 Ver pódio" : next ? `Vez de ${next.name} ▶` : "Jogar de novo ▶";
  }
  $("#r-words").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]"); if (!li) return;
    const x = G.log[+li.dataset.i];
    x.ok = x.ok === "ok" ? "no" : "ok";
    renderResult();
  });

  function commitRound() {
    if (G.committed) return;
    G.committed = true;
    const p = curPlayer();
    if (p) {
      p.score += roundPoints().pts; p.played += 1;
      turn = (turn + 1) % players.length;
    }
    save();
  }
  const gameOver = () => players.length && settings.rounds && players.every((p) => p.played >= settings.rounds);

  $("#btn-r-next").addEventListener("click", () => {
    commitRound();
    history.length = 0; history.push("home");
    if (gameOver()) { show("podium", false); renderPodium(); } else show("ready", false);
  });
  $("#btn-r-home").addEventListener("click", () => {
    commitRound(); history.length = 0;
    if (gameOver()) { history.push("home"); show("podium", false); renderPodium(); } else show("home", false);
  });

  /* ---------------- pódio ---------------- */
  function renderPodium() {
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    const slot = (p, cls, medal) => p ? `<div class="pl ${cls}"><div class="nm">${medal} ${esc(p.name)}</div><div class="bar">${p.score}</div></div>` : "";
    $("#podium").innerHTML = slot(sorted[1], "p2", "🥈") + slot(sorted[0], "p1", "🥇") + slot(sorted[2], "p3", "🥉");
    $("#final-list").innerHTML = sorted.map((p, i) =>
      `<li><span class="avatar" style="background:${COLORS[players.indexOf(p) % COLORS.length]}">${i + 1}º</span><span class="p-name">${esc(p.name)}</span><span class="p-score">${p.score}</span></li>`).join("");
    sfx.go();
  }
  $("#btn-p-home").addEventListener("click", () => { history.length = 0; show("home", false); });
  $("#btn-p-again").addEventListener("click", () => {
    players.forEach((p) => { p.score = 0; p.played = 0; }); turn = 0; save();
    history.length = 0; history.push("home"); show("ready", false);
  });

  /* ---------------- jogadores ---------------- */
  function renderPlayers() {
    const cur = players.length ? turn % players.length : -1;
    $("#player-list").innerHTML = players.map((p, i) => `
      <li class="${i === cur ? "current" : ""}">
        <span class="avatar" style="background:${COLORS[i % COLORS.length]}">${esc(p.name.charAt(0).toUpperCase())}</span>
        <span class="p-name">${esc(p.name)}<small>${i === cur ? "▶ é a vez dessa pessoa" : `${p.played} rodada(s)`}</small></span>
        <span class="p-score">${p.score}</span>
        <button class="mini" data-turn="${i}" title="Passar a vez para">🎯</button>
        <button class="mini" data-up="${i}" title="Subir">⬆️</button>
        <button class="mini" data-del="${i}" title="Remover">✖</button>
      </li>`).join("");
    $("#players-hint").classList.toggle("hidden", players.length > 0);
    $("#group-list").innerHTML = groups.map((g, i) => `
      <li><span>${esc(g.name)}<small>${g.names.map(esc).join(", ")}</small></span>
        <button class="btn small" data-load="${i}">Carregar</button>
        <button class="mini" data-gdel="${i}">🗑️</button></li>`).join("") || `<li><span class="hint">Nenhum grupo salvo ainda.</span></li>`;
  }
  $("#add-player").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#player-name").value.trim();
    if (!name) return;
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast("Esse nome já está na lista"); return; }
    players.push({ name, score: 0, played: 0 });
    $("#player-name").value = ""; save(); renderPlayers();
  });
  $("#player-list").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.del != null) {
      const i = +b.dataset.del; players.splice(i, 1);
      if (turn > i) turn--; if (turn >= players.length) turn = 0;
    } else if (b.dataset.up != null) {
      const i = +b.dataset.up; if (i > 0) { [players[i - 1], players[i]] = [players[i], players[i - 1]]; }
    } else if (b.dataset.turn != null) { turn = +b.dataset.turn; toast("Agora é a vez de " + players[turn].name); }
    save(); renderPlayers();
  });
  $("#btn-shuffle").addEventListener("click", () => { shuffle(players); turn = 0; save(); renderPlayers(); toast("Ordem embaralhada!"); });
  $("#btn-reset-score").addEventListener("click", () => { players.forEach((p) => { p.score = 0; p.played = 0; }); turn = 0; save(); renderPlayers(); toast("Placar zerado"); });
  $("#btn-clear-players").addEventListener("click", () => {
    if (!players.length || !confirm("Remover todos os jogadores?")) return;
    players = []; turn = 0; save(); renderPlayers();
  });
  $("#btn-save-group").addEventListener("click", () => {
    const name = $("#group-name").value.trim();
    if (!players.length) { toast("Adicione jogadores primeiro"); return; }
    if (!name) { toast("Dê um nome ao grupo"); return; }
    const g = { name, names: players.map((p) => p.name) };
    const i = groups.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
    if (i >= 0) groups[i] = g; else groups.push(g);
    $("#group-name").value = ""; save(); renderPlayers(); toast("Grupo salvo!");
  });
  $("#group-list").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.load != null) {
      const g = groups[+b.dataset.load];
      players = g.names.map((name) => ({ name, score: 0, played: 0 })); turn = 0;
      toast(`Grupo "${g.name}" carregado`);
    } else if (b.dataset.gdel != null) {
      groups.splice(+b.dataset.gdel, 1);
    }
    save(); renderPlayers();
  });

  /* ---------------- configurações ---------------- */
  function loadSettingsForm() {
    $("#set-time").value = String(settings.time);
    $("#set-rounds").value = String(settings.rounds);
    $("#set-dir").value = settings.dir;
    $("#set-sens").value = settings.sens;
    $("#set-penalty").checked = settings.penalty;
    $("#set-sound").checked = settings.sound;
    $("#set-vibrate").checked = settings.vibrate;
    $("#set-tap").checked = settings.tap;
    $("#set-norepeat").checked = settings.norepeat;
    if (!hasSensor()) $("#sensor-text").textContent = "Sensor não encontrado neste aparelho — use os toques na tela.";
  }
  const bind = (id, key, conv) => $(id).addEventListener("change", (e) => {
    settings[key] = conv(e.target); save();
    if (key === "sound" && settings.sound) unlockAudio();
  });
  bind("#set-time", "time", (t) => +t.value);
  bind("#set-rounds", "rounds", (t) => +t.value);
  bind("#set-dir", "dir", (t) => t.value);
  bind("#set-sens", "sens", (t) => t.value);
  ["penalty", "sound", "vibrate", "tap", "norepeat"].forEach((k) => bind("#set-" + k, k, (t) => t.checked));
  $("#btn-reset-used").addEventListener("click", () => { used = {}; save(); toast("Todas as palavras liberadas de novo"); });

  /* ---------------- editor de categorias ---------------- */
  let editing = null;
  function openEditor(id) {
    editing = id ? custom.find((c) => c.id === id) : null;
    $("#ed-title").textContent = editing ? "Editar categoria" : "Nova categoria";
    $("#ed-emoji").value = editing ? editing.e : "⭐";
    $("#ed-name").value = editing ? editing.n : "";
    $("#ed-words").value = editing ? editing.w.join("\n") : "";
    $("#ed-delete").classList.toggle("hidden", !editing);
    show("editor");
  }
  $("#btn-new-cat").addEventListener("click", () => openEditor(null));
  $("#ed-save").addEventListener("click", () => {
    const n = $("#ed-name").value.trim();
    const seen = new Set();
    const w = $("#ed-words").value.split(/[\n,;]+/).map((x) => x.trim())
      .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
    if (!n) { toast("Dê um nome para a categoria"); return; }
    if (w.length < 5) { toast("Coloque pelo menos 5 palavras"); return; }
    const e = $("#ed-emoji").value.trim() || "⭐";
    if (editing) Object.assign(editing, { n, e, w });
    else custom.unshift({ id: "u_" + Date.now(), n, e, c: COLORS[custom.length % COLORS.length], w });
    save(); toast("Categoria salva!"); back();
  });
  $("#ed-delete").addEventListener("click", () => {
    if (!editing || !confirm(`Excluir "${editing.n}"?`)) return;
    custom = custom.filter((c) => c !== editing);
    favs = favs.filter((f) => f !== editing.id);
    save(); back();
  });

  /* ---------------- ciclo de vida do app ---------------- */
  window.onBackButton = function () {
    if (!$("#modal-pause").classList.contains("hidden")) { resume(); return true; }
    if (current === "game") { if (G.phase === "end") return true; pause(); return true; }
    if (current === "result") { $("#btn-r-home").click(); return true; }
    if (current === "home") return false;
    back(); return true;
  };
  window.onAppPause = function () { if (current === "game") pause(); };
  window.onAppResume = function () { /* fica pausado até a pessoa tocar em Continuar */ };

  renderHome();
})();
