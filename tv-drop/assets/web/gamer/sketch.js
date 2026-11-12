/* TV Drop — the drawing board shared by the drawing games (Rabisco, Desenho Relâmpago, Telefone Maluco).
   Phone: Sketch.pad() builds the canvas with colors, eraser, brush sizes, undo and clear, upright or on its side,
   and sends each stroke as {k:'s', c, w, p:[x,y,...] (0..1000), n: 1 when a new stroke starts}, {k:'undo'}, {k:'clear'}.
   TV: Sketch.board(canvas) keeps the strokes of one drawing and paints them. */
'use strict';
window.Sketch = (() => {
  const INK = ['#16132b', '#ff4d6d', '#ff9a3d', '#ffd23f', '#3ecf6e', '#3d9bff', '#9b5cff', '#8a5a3c', '#ff8fc7', '#9aa0b5', '#ffffff'];
  const ERASER = 10; // the last "ink" is the paper's white
  const SIZES = [5, 12, 26, 52];

  /** Paints a stroke (points 0..1000) on a square canvas of side S; `from` continues a stroke already on it. */
  function strokeOn(c, S, st, from = 0) {
    const p = st.pts, k = S / 1000;
    c.strokeStyle = INK[st.c] || INK[0]; c.fillStyle = c.strokeStyle; c.lineWidth = (SIZES[st.w] || SIZES[1]) * (S / 720); c.lineCap = 'round'; c.lineJoin = 'round';
    if (p.length === 2) { c.beginPath(); c.arc(p[0] * k, p[1] * k, c.lineWidth / 2, 0, 7); c.fill(); return; }
    const i0 = Math.max(0, from - 2);
    c.beginPath(); c.moveTo(p[i0] * k, p[i0 + 1] * k);
    for (let i = i0 + 2; i < p.length; i += 2) c.lineTo(p[i] * k, p[i + 1] * k);
    c.stroke();
    if (from === 0) { c.beginPath(); c.arc(p[0] * k, p[1] * k, c.lineWidth / 2, 0, 7); c.fill(); }
  }

  /** TV side. canvas may be null (a drawing kept only in memory until it is shown). */
  function board(canvas) {
    const S = canvas ? canvas.width : 720;
    const c = canvas ? canvas.getContext('2d') : null;
    const B = { strokes: [] };
    B.clear = () => { B.strokes = []; if (c) { c.fillStyle = '#fff'; c.fillRect(0, 0, S, S); } };
    B.redraw = () => { if (!c) return; c.fillStyle = '#fff'; c.fillRect(0, 0, S, S); B.strokes.forEach((s) => strokeOn(c, S, s)); };
    /** Applies one message from the phone. Returns true when it was a drawing message. */
    B.apply = (m) => {
      if (m.k === 's') {
        if (!Array.isArray(m.p) || m.p.length < 2 || m.p.length > 400) return true;
        const pts = m.p.map((v) => Math.max(0, Math.min(1000, +v || 0)));
        if (m.n || !B.strokes.length) { if (B.strokes.length < 700) { B.strokes.push({ c: m.c | 0, w: m.w | 0, pts }); if (c) strokeOn(c, S, B.strokes[B.strokes.length - 1]); } }
        else { const st = B.strokes[B.strokes.length - 1], from = st.pts.length; if (from < 6000) { st.pts.push(...pts); if (c) strokeOn(c, S, st, from); } }
        return true;
      }
      if (m.k === 'undo') { B.strokes.pop(); B.redraw(); return true; }
      if (m.k === 'clear') { B.clear(); return true; }
      return false;
    };
    /** The drawing as a picture (data URL), at any size. */
    B.image = (size = 360, type = 'image/jpeg', q = 0.72) => paint(B.strokes, size).toDataURL(type, q);
    B.empty = () => !B.strokes.length;
    B.clear();
    return B;
  }
  function paint(strokes, size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, size, size);
    strokes.forEach((s) => strokeOn(c, size, s));
    return cv;
  }

  /** Phone side: builds the board inside `box`. o: { head: html above the canvas, send(m), onChange(nStrokes) }. */
  function pad(api, box, o = {}) {
    const send = o.send || api.send;
    let ink = 0, size = 1, cur = null, buf = [], fresh = false, lastInk = 0;
    const strokes = [];
    box.innerHTML = `<div class="sk"><div class="sk-head">${o.head || ''}</div><div class="sk-cv"><canvas width="720" height="720"></canvas></div>
      <div class="sk-tools"><div class="sk-inks">${INK.slice(0, ERASER).map((col, i) => `<button class="ink ${i === 0 ? 'on' : ''}" data-i="${i}" style="background:${col}" aria-label="Cor ${i + 1}"></button>`).join('')}</div>
        <div class="sk-row"><button class="tool" id="skEraser" aria-label="Borracha"><svg viewBox="0 0 24 24"><path d="M15 4l5 5-9 9H6l-3-3z"/><path d="M9 10l5 5M6 18h14"/></svg><span>Borracha</span></button>${SIZES.map((s, i) => `<button class="sz ${i === 1 ? 'on' : ''}" data-s="${i}" aria-label="Espessura ${i + 1}"><i style="width:${5 + i * 7}px;height:${5 + i * 7}px"></i></button>`).join('')}
        <button class="tool" id="skUndo" aria-label="Desfazer"><svg viewBox="0 0 24 24"><path d="M8 5L3 10l5 5"/><path d="M3 10h11a6 6 0 0 1 0 12h-3"/></svg><span>Desfazer</span></button><button class="tool" id="skWipe" aria-label="Limpar"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg><span>Limpar</span></button></div></div></div>`;
    const cv = box.querySelector('canvas'), c = cv.getContext('2d'), holder = box.querySelector('.sk-cv');
    const fit = () => { const s = Math.max(120, Math.floor(Math.min(holder.clientWidth, holder.clientHeight))); cv.style.width = cv.style.height = s + 'px'; };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(holder); else addEventListener('resize', fit);
    const redraw = () => { c.fillStyle = '#fff'; c.fillRect(0, 0, 720, 720); strokes.forEach((s) => strokeOn(c, 720, s)); };
    redraw();
    const changed = () => { if (o.onChange) o.onChange(strokes.length); };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(J.clamp((e.clientX - r.left) / r.width, 0, 1) * 1000), Math.round(J.clamp((e.clientY - r.top) / r.height, 0, 1) * 1000)]; };
    const flush = () => { if (!buf.length) return; send({ k: 's', c: ink, w: size, p: buf, n: fresh ? 1 : 0 }); buf = []; fresh = false; };
    let pid = null;
    cv.onpointerdown = (e) => { if (pid !== null) return; pid = e.pointerId; try { cv.setPointerCapture(pid); } catch (err) { /* ignore */ } const p = pos(e); cur = { c: ink, w: size, pts: [p[0], p[1]] }; strokes.push(cur); strokeOn(c, 720, cur); buf = [p[0], p[1]]; fresh = true; changed(); e.preventDefault(); };
    cv.onpointermove = (e) => { if (e.pointerId !== pid || !cur) return; const p = pos(e), n = cur.pts.length; if (Math.abs(p[0] - cur.pts[n - 2]) + Math.abs(p[1] - cur.pts[n - 1]) < 4) return; const from = cur.pts.length; cur.pts.push(p[0], p[1]); strokeOn(c, 720, cur, from); buf.push(p[0], p[1]); if (buf.length >= 60) flush(); };
    const up = (e) => { if (e.pointerId !== pid) return; pid = null; flush(); cur = null; };
    cv.onpointerup = up; cv.onpointercancel = up;
    api.every(45, flush);
    const inks = [...box.querySelectorAll('.ink')], eraser = box.querySelector('#skEraser');
    const paintInk = () => { inks.forEach((x) => x.classList.toggle('on', +x.dataset.i === ink)); eraser.classList.toggle('on', ink === ERASER); };
    inks.forEach((b) => { b.onclick = () => { ink = lastInk = +b.dataset.i; paintInk(); api.vib(10); }; });
    eraser.onclick = () => { ink = ink === ERASER ? lastInk : ERASER; paintInk(); api.vib(10); };
    box.querySelectorAll('.sz').forEach((b) => { b.onclick = () => { size = +b.dataset.s; box.querySelectorAll('.sz').forEach((x) => x.classList.toggle('on', x === b)); api.vib(10); }; });
    box.querySelector('#skUndo').onclick = () => { if (!strokes.length) return; flush(); strokes.pop(); redraw(); send({ k: 'undo' }); changed(); };
    box.querySelector('#skWipe').onclick = () => { if (!strokes.length) return; flush(); strokes.length = 0; redraw(); send({ k: 'clear' }); changed(); };
    return { strokes, count: () => strokes.length, flush, head: box.querySelector('.sk-head') };
  }

  return { INK, ERASER, SIZES, strokeOn, board, pad, paint };
})();
