// Desarme a Bomba: thousands of bombs, every one must be solvable from its own manual and split fairly.
//   node test/bomb-logic.test.js
'use strict';
const assert = require('assert');
const B = require('../assets/web/gamer/bomb-logic.js');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const each = (fn) => { for (const level of ['facil', 'medio', 'dificil']) for (let seed = 1; seed <= 1500; seed++) fn(B.make(level, B.seeded(seed * 7919 + level.length)), level, seed); };

test('every bomb has the modules of its level and readable facts', () => {
  each((b, level) => {
    assert.strictEqual(b.modules.length, B.LEVELS[level].modules);
    assert.strictEqual(new Set(b.modules.map((m) => m.type)).size, b.modules.length, 'no repeated module');
    assert.ok(/^[A-Z0-9]{4}\d$/.test(b.facts.serial));
    assert.strictEqual(b.facts.odd, +b.facts.serial.slice(-1) % 2 === 1);
    assert.strictEqual(b.facts.vowel, /[AEIOU]/.test(b.facts.serial));
    assert.ok(b.facts.batteries >= 1 && b.facts.batteries <= 3);
  });
});

test('the solution of each module can be reached using only what the manual says', () => {
  each((b) => {
    for (const m of b.modules) {
      if (m.type === 'fios') {
        assert.ok(m.solution >= 0 && m.solution < m.view.colors.length, 'the wire exists');
        assert.strictEqual(m.page.lines.length, m.rules.length);
        assert.ok(/nenhuma regra anterior/.test(m.page.lines[m.page.lines.length - 1]), 'there is always a last rule');
        assert.strictEqual(B.solveWires(m.rules, m.view.colors, b.facts), m.solution);
      } else if (m.type === 'simbolos') {
        const having = m.page.cols.filter((c) => m.view.syms.every((s) => c.syms.includes(s)));
        assert.strictEqual(having.length, 1, 'exactly one column has the four symbols');
        assert.deepStrictEqual(having[0].syms.filter((s) => m.view.syms.includes(s)), m.solution);
      } else if (m.type === 'senha') {
        const row = m.page.rows.find((r) => r[0] === m.view.light), col = m.page.head.indexOf(m.view.word);
        assert.ok(row && col > 0, 'light and word are in the table');
        const base = row[col];
        assert.strictEqual(m.solution, m.twist && b.facts.batteries > 1 ? base.split('').reverse().join('') : base);
        assert.strictEqual(/de trás para frente/.test(m.page.intro), m.twist, 'the twist is written in the manual');
        assert.strictEqual(new Set(m.page.rows.flatMap((r) => r.slice(1))).size, 12, 'no repeated code');
      } else if (m.type === 'cores') {
        const col = b.facts.vowel ? 1 : 2;
        assert.deepStrictEqual(m.view.seq.map((c) => m.page.rows.find((r) => r[0] === c)[col]), m.solution);
      } else if (m.type === 'botao') {
        assert.ok(m.solution >= 1 && m.solution <= 5);
        assert.strictEqual(B.solveButton(m.rules, m.view, b.facts), m.solution);
      }
    }
  });
});

test('doing what the manual says disarms the bomb with no mistake', () => {
  each((b) => {
    b.modules.forEach((m, i) => {
      let r;
      if (m.type === 'fios') r = B.act(b, i, { cut: m.solution });
      else if (m.type === 'senha') r = B.act(b, i, { code: m.solution });
      else if (m.type === 'botao') r = B.act(b, i, { n: m.solution });
      else m.solution.forEach((s) => { r = B.act(b, i, { press: s }); });
      assert.ok(r.ok && r.done && m.solved);
    });
    assert.strictEqual(b.strikes, 0);
  });
});

test('a wrong move is a mistake, the module stays armed and can still be solved', () => {
  each((b) => {
    b.modules.forEach((m, i) => {
      let r;
      if (m.type === 'fios') r = B.act(b, i, { cut: (m.solution + 1) % m.view.colors.length });
      else if (m.type === 'senha') r = B.act(b, i, { code: m.solution === '0000' ? '1111' : '0000' });
      else if (m.type === 'botao') r = B.act(b, i, { n: (m.solution % 5) + 1 });
      else if (m.type === 'simbolos') r = B.act(b, i, { press: m.view.syms.find((s) => s !== m.solution[0]) });
      else r = B.act(b, i, { press: B.SIMON.find((c) => c !== m.solution[0]) });
      assert.ok(r.ok === false && !m.solved);
      if (m.type === 'fios') r = B.act(b, i, { cut: m.solution });
      else if (m.type === 'senha') r = B.act(b, i, { code: m.solution });
      else if (m.type === 'botao') r = B.act(b, i, { n: m.solution });
      else m.solution.forEach((s) => { r = B.act(b, i, { press: s }); });
      assert.ok(r.done && m.solved);
    });
    assert.strictEqual(b.strikes, b.modules.length);
  });
});

test('junk and repeated actions are ignored, not punished', () => {
  const b = B.make('dificil', B.seeded(42));
  b.modules.forEach((m, i) => {
    assert.ok(B.act(b, i, null).ignored && B.act(b, i, { cut: 99 }).ignored !== false);
    if (m.type === 'senha') assert.ok(B.act(b, i, { code: '12' }).ignored);
    if (m.type === 'botao') assert.ok(B.act(b, i, { n: 0 }).ignored);
    if (m.type === 'simbolos') assert.ok(B.act(b, i, { press: 99 }).ignored);
  });
  assert.ok(B.act(b, 99, { cut: 0 }).ignored);
  assert.strictEqual(b.strikes, 0);
  const w = b.modules.findIndex((m) => m.type === 'fios');
  const wrong = (b.modules[w].solution + 1) % b.modules[w].view.colors.length;
  B.act(b, w, { cut: wrong });
  assert.ok(B.act(b, w, { cut: wrong }).ignored, 'cutting the same wire twice counts once');
  assert.strictEqual(b.strikes, 1);
});

test('the manual is dealt whole, and with two or more experts nobody has a whole module', () => {
  each((b, level, seed) => {
    if (seed > 300) return;
    for (let experts = 1; experts <= 5; experts++) {
      const hands = B.deal(b, experts);
      assert.strictEqual(hands.length, experts);
      for (const m of b.modules) {
        const key = m.page.type === 'text' ? 'lines' : m.page.type === 'table' ? 'rows' : 'cols';
        const parts = hands.flatMap((h) => h.filter((p) => p.title === m.title));
        const got = parts.flatMap((p) => p[key]);
        assert.strictEqual(got.length, m.page[key].length, 'every rule was dealt exactly once');
        assert.deepStrictEqual(got.map((x) => JSON.stringify(x)).sort(), m.page[key].map((x) => JSON.stringify(x)).sort());
        if (experts >= 2) for (const h of hands) { const mine = h.filter((p) => p.title === m.title); assert.ok(mine.length <= 1); if (mine.length) assert.ok(mine[0].have < mine[0].total, 'nobody holds a whole module'); }
        else assert.strictEqual(parts[0].have, parts[0].total);
      }
    }
  });
});

test('different matches give different bombs', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) { const b = B.make('medio', B.seeded(seed)); seen.add(JSON.stringify(b.modules.map((m) => [m.type, m.view, m.solution]))); }
  assert.ok(seen.size >= 299, 'bombs repeat: ' + seen.size);
});

console.log(`bomb: ${n} testes ok`);
