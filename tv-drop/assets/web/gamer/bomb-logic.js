/* TV Drop — Desarme a Bomba: the bomb itself, with no screen and no network (so it can be tested by the thousands).
   make(level, rnd) builds a bomb: facts (serial number, batteries), modules, each with what the technician sees
   (view), the manual that explains it (page) and the solution, which is always computed FROM the manual's rules.
   act(bomb, i, action) applies what the technician did and says if it was right.
   deal(bomb, experts) splits the manual so that nobody holds all of it.
   Works in the browser (window.BombLogic) and in Node (tests). */
'use strict';
(function (root) {
  const COLORS = { vermelho: '#ff4d4d', azul: '#3d8bff', amarelo: '#ffd23f', branco: '#f2f2f2', preto: '#3a3a46', verde: '#3ecf6e' };
  const SIMON = ['vermelho', 'azul', 'verde', 'amarelo'];
  const WORDS = ['ALFA', 'BETA', 'GAMA', 'DELTA', 'SIGMA', 'ÔMEGA'];
  const LABELS = ['ABORTAR', 'DETONAR', 'SEGURAR', 'APERTE'];
  const BTN_COLORS = ['vermelho', 'azul', 'amarelo', 'branco'];
  const TITLES = { fios: 'Fios', simbolos: 'Símbolos', senha: 'Senha', cores: 'Sequência de cores', botao: 'Botão' };
  // 12 symbols with no name on purpose: the technician has to describe them
  const SYMBOLS = [
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.6"/>',
    '<path d="M12 4l8 15H4z"/><path d="M8.5 14h7"/>',
    '<path d="M12 3l2.6 6 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.6 9.4 9z"/>',
    '<path d="M16 4a8 8 0 1 0 4 13A7 7 0 0 1 16 4z"/>',
    '<path d="M6 4h12L6 20h12z"/>',
    '<path d="M12 4v16M6 5v5a6 6 0 0 0 12 0V5"/>',
    '<path d="M14 3L6 13h6l-2 8 8-11h-6z"/>',
    '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6"/>',
    '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
    '<path d="M12 3v18M6 8h12M8 14h8"/>',
    '<rect x="4" y="4" width="16" height="16"/><path d="M12 6l6 6-6 6-6-6z"/>',
    '<path d="M5 19h4v-2a6 6 0 1 1 6 0v2h4"/>',
  ];
  const LEVELS = { facil: { modules: 3, wires: [4, 5], seq: 3, twist: false }, medio: { modules: 4, wires: [4, 6], seq: 4, twist: true }, dificil: { modules: 5, wires: [5, 6], seq: 5, twist: true } };

  /** A small seeded generator, so a test can rebuild the same bomb. */
  function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function tools(rnd) {
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    return { int, pick, shuffle };
  }
  const times = (n) => (n === 1 ? '1 vez' : n + ' vezes');

  /* ---------------------------------------------------------------- wires */
  const wireCond = {
    none: (c) => `Se não houver nenhum fio ${c.c}`, many: (c) => `Se houver mais de um fio ${c.c}`, one: (c) => `Se houver exatamente um fio ${c.c}`,
    last: (c) => `Se o último fio for ${c.c}`, first: (c) => `Se o primeiro fio for ${c.c}`,
    odd: () => 'Se o último dígito do número de série for ímpar', bat: () => 'Se a bomba tiver mais de uma pilha',
  };
  function wireTest(c, ws, facts) {
    const n = ws.filter((w) => w === c.c).length;
    switch (c.t) { case 'none': return n === 0; case 'many': return n > 1; case 'one': return n === 1; case 'last': return ws[ws.length - 1] === c.c; case 'first': return ws[0] === c.c; case 'odd': return facts.odd; case 'bat': return facts.batteries > 1; default: return false; }
  }
  const wireActText = (a) => (a.t === 'idx' ? `corte o ${a.i}º fio` : a.t === 'last' ? 'corte o último fio' : a.t === 'firstOf' ? `corte o primeiro fio ${a.c}` : `corte o último fio ${a.c}`);
  const wireTarget = (a, ws) => (a.t === 'idx' ? a.i - 1 : a.t === 'last' ? ws.length - 1 : a.t === 'firstOf' ? ws.indexOf(a.c) : ws.lastIndexOf(a.c));
  /** The wire to cut according to the rules: the first rule whose condition is true decides. */
  function solveWires(rules, ws, facts) { for (const r of rules) if (!r.cond || wireTest(r.cond, ws, facts)) return wireTarget(r.act, ws); return 0; }
  function makeWires(R, facts, L) {
    const n = R.int(L.wires[0], L.wires[1]);
    const pal = R.shuffle(Object.keys(COLORS)).slice(0, R.int(3, 4)); // few colors, so repeated ones happen
    const ws = Array.from({ length: n }, () => R.pick(pal));
    const types = R.shuffle(['none', 'many', 'one', 'last', 'first', 'odd', 'bat']).slice(0, 3);
    const rules = types.map((t) => {
      const cond = { t, c: R.pick(pal.concat(R.pick(Object.keys(COLORS)))) };
      const sure = t === 'many' || t === 'one' || t === 'last' || t === 'first'; // the color exists when the rule applies
      const acts = [{ t: 'idx', i: R.int(1, L.wires[0]) }, { t: 'last' }];
      if (sure) acts.push({ t: 'firstOf', c: cond.c }, { t: 'lastOf', c: cond.c });
      return { cond, act: R.pick(acts) };
    });
    rules.push({ cond: null, act: { t: 'idx', i: R.int(1, L.wires[0]) } });
    return {
      type: 'fios', view: { colors: ws }, rules, solution: solveWires(rules, ws, facts), state: { cut: [] },
      page: { type: 'text', title: TITLES.fios, intro: 'Conte os fios de cima para baixo. Vale só a PRIMEIRA regra verdadeira, na ordem dos números. Pergunte as regras que você não tem.',
        lines: rules.map((r, i) => `Regra ${i + 1}: ${r.cond ? wireCond[r.cond.t](r.cond) : 'Se nenhuma regra anterior valer'}, ${wireActText(r.act)}.`) },
    };
  }

  /* ---------------------------------------------------------------- symbols */
  function makeSymbols(R) {
    for (;;) {
      const all = SYMBOLS.map((_, i) => i);
      const cols = [0, 1, 2].map(() => R.shuffle(all).slice(0, 6));
      const k = R.int(0, 2);
      const four = R.shuffle(cols[k]).slice(0, 4);
      if (cols.some((c, i) => i !== k && four.every((s) => c.includes(s)))) continue; // only one column may have the four
      return {
        type: 'simbolos', view: { syms: R.shuffle(four) }, cols, solution: cols[k].filter((s) => four.includes(s)), state: { prog: 0 },
        page: { type: 'symbols', title: TITLES.simbolos, intro: 'A bomba mostra 4 símbolos. Só uma coluna tem os 4: aperte na ordem em que eles aparecem nessa coluna, de cima para baixo.', cols: cols.map((c, i) => ({ name: 'Coluna ' + 'ABC'[i], syms: c })) },
      };
    }
  }

  /* ---------------------------------------------------------------- numeric code */
  function makeCode(R, facts, L) {
    const words = R.shuffle(WORDS).slice(0, 3), lights = R.shuffle(SIMON);
    const used = new Set();
    const code = () => { for (;;) { const c = String(R.int(1000, 9999)); if (!used.has(c) && c !== c.split('').reverse().join('')) { used.add(c); return c; } } };
    const table = lights.map((l) => [l, ...words.map(() => code())]);
    const light = R.pick(lights), word = R.pick(words);
    const base = table.find((r) => r[0] === light)[1 + words.indexOf(word)];
    const twist = L.twist;
    return {
      type: 'senha', view: { light, word }, table, words, twist, solution: twist && facts.batteries > 1 ? base.split('').reverse().join('') : base, state: {},
      page: { type: 'table', title: TITLES.senha, intro: 'A bomba mostra uma luz e uma palavra. A senha está no cruzamento da linha da luz com a coluna da palavra.' + (twist ? ' ATENÇÃO: se a bomba tiver mais de uma pilha, digite a senha de trás para frente.' : ''), head: ['Luz', ...words], rows: table },
    };
  }

  /* ---------------------------------------------------------------- color sequence */
  function makeColors(R, facts, L) {
    const perm = () => { for (;;) { const p = R.shuffle(SIMON); if (p.some((c, i) => c !== SIMON[i])) return p; } };
    const withVowel = perm(), without = perm();
    const seq = Array.from({ length: L.seq }, () => R.pick(SIMON));
    const map = facts.vowel ? withVowel : without;
    return {
      type: 'cores', view: { seq }, withVowel, without, solution: seq.map((c) => map[SIMON.indexOf(c)]), state: { prog: 0 },
      page: { type: 'table', title: TITLES.cores, intro: 'A bomba pisca uma sequência de cores. Para cada cor que piscar, aperte a cor indicada na tabela, na mesma ordem. Use a coluna certa para o número de série.', head: ['Piscou', 'Série COM vogal', 'Série SEM vogal'], rows: SIMON.map((c, i) => [c, withVowel[i], without[i]]) },
    };
  }

  /* ---------------------------------------------------------------- the big button */
  const btnCond = {
    col: (c) => `Se o botão for ${c.c}`, lab: (c) => `Se o botão disser ${c.l}`, both: (c) => `Se o botão for ${c.c} e disser ${c.l}`,
    bat: () => 'Se a bomba tiver mais de uma pilha', vowel: () => 'Se o número de série tiver vogal',
  };
  function btnTest(c, v, facts) { switch (c.t) { case 'col': return v.color === c.c; case 'lab': return v.label === c.l; case 'both': return v.color === c.c && v.label === c.l; case 'bat': return facts.batteries > 1; case 'vowel': return facts.vowel; default: return false; } }
  function solveButton(rules, v, facts) { for (const r of rules) if (!r.cond || btnTest(r.cond, v, facts)) return r.n; return 1; }
  function makeButton(R, facts) {
    const view = { color: R.pick(BTN_COLORS), label: R.pick(LABELS) };
    const types = R.shuffle(['col', 'lab', 'both', 'bat', 'vowel']).slice(0, 3);
    const counts = R.shuffle([1, 2, 3, 4, 5]);
    // about half of the time one rule talks about this very button
    const rules = types.map((t, i) => ({ cond: { t, c: R.int(0, 1) ? view.color : R.pick(BTN_COLORS), l: R.int(0, 1) ? view.label : R.pick(LABELS) }, n: counts[i] }));
    rules.push({ cond: null, n: counts[3] });
    return {
      type: 'botao', view, rules, solution: solveButton(rules, view, facts), state: {},
      page: { type: 'text', title: TITLES.botao, intro: 'O botão tem uma cor e uma palavra. Vale só a PRIMEIRA regra verdadeira, na ordem dos números. O técnico aperta o número certo de vezes e confirma.',
        lines: rules.map((r, i) => `Regra ${i + 1}: ${r.cond ? btnCond[r.cond.t](r.cond) : 'Se nenhuma regra anterior valer'}, aperte ${times(r.n)}.`) },
    };
  }

  const MAKERS = { fios: makeWires, simbolos: makeSymbols, senha: makeCode, cores: makeColors, botao: makeButton };

  /** A new bomb. level: 'facil' | 'medio' | 'dificil'. */
  function make(level, rnd) {
    const R = tools(rnd || Math.random), L = LEVELS[level] || LEVELS.medio;
    const letters = 'ABCEFGHJKLMNPRTUVXZ';
    const serial = Array.from({ length: 4 }, () => (R.int(0, 2) ? R.pick(letters.split('')) : String(R.int(0, 9)))).join('') + R.int(0, 9);
    const facts = { serial, batteries: R.int(1, 3), vowel: /[AEIOU]/.test(serial), odd: +serial.slice(-1) % 2 === 1 };
    const types = R.shuffle(Object.keys(MAKERS)).slice(0, L.modules);
    const modules = types.map((t) => { const m = MAKERS[t](R, facts, L); m.title = TITLES[t]; m.solved = false; return m; });
    return { level, facts, modules, strikes: 0 };
  }

  /** What the technician did on module i. Returns { ok, done, ignored }: ok=false is a mistake (a strike). */
  function act(bomb, i, a) {
    const m = bomb.modules[i];
    if (!m || m.solved || !a) return { ignored: true };
    const right = () => { m.solved = true; return { ok: true, done: true }; };
    const wrong = () => { bomb.strikes++; return { ok: false, done: false }; };
    if (m.type === 'fios') {
      const w = a.cut | 0;
      if (!(w >= 0 && w < m.view.colors.length) || m.state.cut[w]) return { ignored: true };
      m.state.cut[w] = true;
      return w === m.solution ? right() : wrong();
    }
    if (m.type === 'simbolos' || m.type === 'cores') {
      const want = m.solution[m.state.prog];
      const got = m.type === 'simbolos' ? a.press | 0 : String(a.press);
      if (m.type === 'simbolos' ? !m.view.syms.includes(got) : !SIMON.includes(got)) return { ignored: true };
      if (got !== want) { m.state.prog = 0; return wrong(); }
      m.state.prog++;
      return m.state.prog >= m.solution.length ? right() : { ok: true, done: false };
    }
    if (m.type === 'senha') { const c = String(a.code || ''); if (!/^\d{4}$/.test(c)) return { ignored: true }; return c === m.solution ? right() : wrong(); }
    if (m.type === 'botao') { const n = a.n | 0; if (n < 1 || n > 9) return { ignored: true }; return n === m.solution ? right() : wrong(); }
    return { ignored: true };
  }

  /** Splits the manual among `experts` phones: each module's rules (or table rows, or columns) are dealt to two or
      three different people, so they have to talk. With one expert, that person gets everything. */
  function deal(bomb, experts) {
    const out = Array.from({ length: Math.max(1, experts) }, () => []);
    bomb.modules.forEach((m, mi) => {
      const p = m.page, key = p.type === 'text' ? 'lines' : p.type === 'table' ? 'rows' : 'cols';
      const items = p[key];
      const holders = experts <= 1 ? 1 : Math.min(experts, items.length > 4 ? 3 : 2);
      for (let h = 0; h < holders; h++) {
        const mine = items.filter((_, j) => j % holders === h);
        const page = { type: p.type, title: p.title, intro: p.intro, total: items.length, have: mine.length };
        if (p.head) page.head = p.head;
        page[key] = mine;
        out[(mi + h) % out.length].push(page);
      }
    });
    return out;
  }

  const api = { COLORS, SIMON, SYMBOLS, TITLES, LEVELS, make, act, deal, seeded, solveWires, solveButton };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BombLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
