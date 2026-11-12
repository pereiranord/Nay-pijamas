/* TV Drop — Central Gamer cover art. Every cover is drawn in code (crisp at any size, a few KB instead of
   images), with the same character set as the games and one scene per game. Covers.url(id, {w, title}). */
'use strict';
window.Covers = (() => {
  const { COLORS, SHAPES, drawBuddy, shapePath, rgba, shade } = J;
  const cache = {};
  const W = 960, H = 540;
  const P = (i) => ({ color: COLORS[i % 6], shape: SHAPES[i % 6], idx: i });

  /* ---------- helpers ---------- */
  function linear(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
  function radial(c, x, y, r, stops) { const g = c.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
  function fill(c, style) { c.fillStyle = style; c.fillRect(0, 0, W, H); }
  function glow(c, x, y, r, col, a = 0.55) { c.fillStyle = radial(c, x, y, r, [[0, rgba(col, a)], [1, rgba(col, 0)]]); c.fillRect(x - r, y - r, r * 2, r * 2); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function stroke(c, col, w, pts, close) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); c.stroke(); }
  function curve(c, col, w, x0, y0, cx, cy, x1, y1) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.stroke(); }
  function star(c, x, y, r, col, rot = 0) { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; shapePath(c, 'estrela', r); c.fill(); c.restore(); }
  function sparkles(c, n, col, seed, area = [0, 0, W, H]) {
    let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) { const x = area[0] + rnd() * area[2], y = area[1] + rnd() * area[3], r = 1 + rnd() * 2.6; c.fillStyle = rgba(col, 0.25 + rnd() * 0.6); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  }
  function bud(c, x, y, r, i, o = {}) { drawBuddy(c, x, y, r, P(i), { shadow: false, ...o }); }
  function vignette(c, a = 0.55) { c.fillStyle = radial(c, W / 2, H * 0.45, W * 0.75, [[0.55, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${a})`]]); c.fillRect(0, 0, W, H); }
  function txt(c, s, x, y, font, col, align = 'left') { c.font = font; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); }

  /* ---------- the scenes ---------- */
  const SCENES = {
    rabisco(c) {
      fill(c, linear(c, 0, 0, W, H, [[0, '#0d1b3e'], [0.55, '#2a1a5e'], [1, '#4a1f6e']]));
      glow(c, 760, 120, 420, '#3dc9ff', 0.35); glow(c, 160, 480, 380, '#b47cff', 0.4);
      // background scribbles
      c.globalAlpha = 0.35;
      curve(c, '#ffc857', 14, -20, 120, 260, -40, 520, 90); curve(c, '#ff4d6d', 10, 40, 520, 300, 360, 620, 560); curve(c, '#3df5a7', 8, 820, 520, 980, 380, 900, 250);
      c.globalAlpha = 1;
      // sketchbook page
      c.save(); c.translate(600, 255); c.rotate(-0.07);
      c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -232, -162, 476, 340, 22); c.fill();
      c.fillStyle = '#fbfaf6'; rr(c, -240, -170, 476, 340, 22); c.fill();
      c.strokeStyle = '#e4e1d8'; c.lineWidth = 2; for (let y = -120; y < 160; y += 34) { c.beginPath(); c.moveTo(-210, y); c.lineTo(210, y); c.stroke(); }
      stroke(c, '#1a1330', 9, [[-140, 110], [-140, 0], [0, 0], [0, 110], [-140, 110]]);
      stroke(c, '#ff4d6d', 9, [[-170, 6], [-70, -86], [30, 6]]);
      stroke(c, '#1a1330', 7, [[-88, 110], [-88, 54], [-52, 54], [-52, 110]]);
      c.strokeStyle = '#ffc857'; c.lineWidth = 9; c.beginPath(); c.arc(130, -80, 34, 0, 7); c.stroke();
      for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; stroke(c, '#ffc857', 6, [[130 + Math.cos(ang) * 50, -80 + Math.sin(ang) * 50], [130 + Math.cos(ang) * 66, -80 + Math.sin(ang) * 66]]); }
      curve(c, '#3ecf6e', 10, -220, 130, 0, 100, 220, 132);
      c.restore();
      // pencil
      c.save(); c.translate(770, 400); c.rotate(-0.85);
      c.fillStyle = '#ffc857'; rr(c, -16, -150, 32, 220, 6); c.fill();
      c.fillStyle = '#e8a63a'; c.fillRect(4, -150, 12, 220);
      c.fillStyle = '#ff7a9a'; rr(c, -16, -186, 32, 40, 8); c.fill();
      c.fillStyle = '#c9ccd4'; c.fillRect(-16, -152, 32, 14);
      c.fillStyle = '#f3d9b1'; c.beginPath(); c.moveTo(-16, 70); c.lineTo(16, 70); c.lineTo(0, 118); c.closePath(); c.fill();
      c.fillStyle = '#1a1330'; c.beginPath(); c.moveTo(-6, 102); c.lineTo(6, 102); c.lineTo(0, 118); c.closePath(); c.fill();
      c.restore();
      bud(c, 175, 300, 92, 3, { mood: 'wow', look: [1, -0.4] });
      sparkles(c, 40, '#ffffff', 7);
    },
    batata(c) {
      fill(c, radial(c, W / 2, H * 0.48, W * 0.7, [[0, '#ffb02e'], [0.35, '#e0531f'], [0.75, '#6e1410'], [1, '#2a0708']]));
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; c.fillStyle = 'rgba(255,240,180,.06)'; c.beginPath(); c.moveTo(W / 2, H * 0.48); c.arc(W / 2, H * 0.48, 900, a, a + 0.12); c.closePath(); c.fill(); }
      const bx = W / 2, by = 270, R = 108;
      glow(c, bx, by, 260, '#fff2b0', 0.45);
      c.fillStyle = radial(c, bx - 40, by - 40, R * 1.3, [[0, '#7a7790'], [0.5, '#2c2a3e'], [1, '#100f1a']]); c.beginPath(); c.arc(bx, by, R, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(bx - 40, by - 50, 34, 18, -0.6, 0, 7); c.fill();
      c.fillStyle = '#2b2940'; rr(c, bx - 24, by - R - 26, 48, 34, 8); c.fill();
      c.strokeStyle = '#c9a36a'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, by - R - 24); c.bezierCurveTo(bx + 40, by - R - 90, bx + 90, by - R - 40, bx + 120, by - R - 90); c.stroke();
      const sx = bx + 122, sy = by - R - 94;
      glow(c, sx, sy, 90, '#ffd23f', 0.8);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; stroke(c, i % 2 ? '#fff' : '#ffd23f', 5, [[sx + Math.cos(a) * 14, sy + Math.sin(a) * 14], [sx + Math.cos(a) * (36 + (i % 3) * 10), sy + Math.sin(a) * (36 + (i % 3) * 10)]]); }
      bud(c, 150, 420, 70, 0, { mood: 'wow', look: [1, -1] });
      bud(c, 810, 420, 70, 3, { mood: 'sad', look: [-1, -1] });
      bud(c, 96, 210, 52, 4, { mood: 'wow', look: [1, 0.3] });
      bud(c, 868, 200, 52, 1, { mood: 'wow', look: [-1, 0.4] });
      sparkles(c, 50, '#ffe08a', 3);
      vignette(c, 0.5);
    },
    mente(c) {
      fill(c, linear(c, 0, 0, W, H, [[0, '#06282a'], [0.5, '#0b4a4a'], [1, '#0a2f4f']]));
      glow(c, 300, 200, 420, '#3df5a7', 0.3); glow(c, 760, 380, 380, '#3dc9ff', 0.35);
      const bubble = (x, y, w, h, tail, col, ink, text, font) => {
        c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, x + 8, y + 10, w, h, 30); c.fill();
        c.fillStyle = col; rr(c, x, y, w, h, 30); c.fill();
        c.beginPath(); c.moveTo(x + tail, y + h - 2); c.lineTo(x + tail - 10, y + h + 40); c.lineTo(x + tail + 34, y + h - 2); c.closePath(); c.fill();
        txt(c, text, x + w / 2, y + h / 2 + 22, font, ink, 'center');
      };
      bubble(500, 50, 270, 140, 70, '#f5fff9', '#0b3a35', '?', '900 116px Archivo');
      bubble(90, 70, 236, 116, 170, '#3df5a7', '#06282a', 'VERDADE', '800 40px Archivo');
      bubble(560, 230, 236, 104, 186, '#ff4d6d', '#fff', 'MENTIRA', '800 38px Archivo');
      bud(c, 300, 300, 80, 2, { mood: 'happy', look: [0.8, -0.6] });
      // the liar: a buddy wearing a mask, looking sideways
      const mx = 790, my = 410;
      bud(c, mx, my, 84, 4, { mood: 'angry', look: [-1, 0] });
      c.fillStyle = '#16132b'; rr(c, mx - 64, my - 30, 128, 32, 16); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(mx - 26, my - 14, 12, 9, 0, 0, 7); c.ellipse(mx + 26, my - 14, 12, 9, 0, 0, 7); c.fill();
      c.fillStyle = '#16132b'; c.beginPath(); c.arc(mx - 31, my - 13, 5, 0, 7); c.arc(mx + 21, my - 13, 5, 0, 7); c.fill();
      sparkles(c, 40, '#bfffe8', 11);
      vignette(c, 0.4);
    },
    arena(c) {
      fill(c, linear(c, 0, 0, 0, H, [[0, '#07051a'], [0.45, '#1a0d3d'], [1, '#2b0b3a']]));
      glow(c, W / 2, 210, 520, '#b47cff', 0.35);
      const hy = 230;
      c.strokeStyle = 'rgba(255,77,109,.55)'; c.lineWidth = 2;
      for (let i = -14; i <= 14; i++) { c.beginPath(); c.moveTo(W / 2 + i * 12, hy); c.lineTo(W / 2 + i * 140, H); c.stroke(); }
      for (let k = 0; k < 9; k++) { const t = Math.pow(k / 9, 2); const y = hy + (H - hy) * t; c.strokeStyle = `rgba(61,201,255,${0.15 + t * 0.5})`; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.fillStyle = linear(c, 0, hy - 40, 0, hy + 10, [[0, 'rgba(255,77,109,0)'], [1, 'rgba(255,77,109,.5)']]); c.fillRect(0, hy - 40, W, 50);
      const ship = (x, y, a, col, s = 1) => {
        c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = linear(c, -120, 0, 0, 0, [[0, rgba(col, 0)], [1, rgba(col, 0.7)]]); c.beginPath(); c.moveTo(-14, -9); c.lineTo(-150, 0); c.lineTo(-14, 9); c.fill();
        c.globalCompositeOperation = 'source-over';
        glow(c, 0, 0, 70, col, 0.5);
        c.beginPath(); c.moveTo(34, 0); c.lineTo(-22, -24); c.lineTo(-12, 0); c.lineTo(-22, 24); c.closePath();
        c.fillStyle = col; c.fill(); c.lineWidth = 4; c.strokeStyle = '#fff'; c.lineJoin = 'round'; c.stroke();
        c.fillStyle = '#120f26'; c.beginPath(); c.arc(4, 0, 7, 0, 7); c.fill();
        c.restore();
      };
      c.globalCompositeOperation = 'lighter';
      stroke(c, 'rgba(255,255,255,.9)', 4, [[420, 330], [640, 250]]); stroke(c, 'rgba(255,77,109,.6)', 14, [[420, 330], [640, 250]]);
      stroke(c, 'rgba(255,255,255,.9)', 4, [[560, 410], [760, 380]]); stroke(c, 'rgba(61,201,255,.6)', 14, [[560, 410], [760, 380]]);
      c.globalCompositeOperation = 'source-over';
      ship(330, 370, -0.35, '#ff4d6d', 1.6); ship(700, 220, 2.8, '#3dc9ff', 1.3); ship(810, 410, 3.4, '#ffd23f', 1.1); ship(160, 200, 0.4, '#3df5a7', 0.9);
      glow(c, 650, 248, 60, '#ffffff', 0.8);
      sparkles(c, 70, '#ffffff', 5, [0, 0, W, hy]);
    },
    corrida(c) {
      fill(c, '#2a1d4a');
      for (let y = 0; y < H; y += 44) { c.fillStyle = (y / 44) % 2 ? '#2f2153' : '#271a45'; c.fillRect(0, y, W, 44); }
      c.lineCap = 'round';
      const track = () => { c.beginPath(); c.moveTo(-60, 470); c.bezierCurveTo(260, 470, 280, 150, 560, 170); c.bezierCurveTo(820, 190, 860, 420, 1040, 380); };
      track(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 170; c.stroke();
      track(); c.strokeStyle = '#f4f1ff'; c.lineWidth = 156; c.stroke();
      c.setLineDash([26, 26]); track(); c.strokeStyle = '#ff4d6d'; c.lineWidth = 156; c.stroke(); c.setLineDash([]);
      track(); c.strokeStyle = '#443d6e'; c.lineWidth = 136; c.stroke();
      c.setLineDash([20, 26]); track(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.stroke(); c.setLineDash([]);
      const sofa = (x, y, a, col, s = 1) => {
        c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
        for (let i = 0; i < 4; i++) { c.strokeStyle = `rgba(255,255,255,${0.5 - i * 0.1})`; c.lineWidth = 5; c.beginPath(); c.moveTo(-60 - i * 26, -16 + i * 10); c.lineTo(-90 - i * 26, -16 + i * 10); c.stroke(); }
        c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -46, -26, 96, 66, 14); c.fill();
        c.fillStyle = col; rr(c, -48, -34, 96, 68, 16); c.fill();
        c.fillStyle = shade(col, -0.35); rr(c, -48, -34, 26, 68, 10); c.fill(); rr(c, -24, -34, 70, 14, 7); c.fill(); rr(c, -24, 20, 70, 14, 7); c.fill();
        c.fillStyle = shade(col, 0.3); rr(c, -18, -18, 28, 36, 7); c.fill(); rr(c, 14, -18, 28, 36, 7); c.fill();
        c.restore();
      };
      sofa(560, 172, 0.05, '#ff9a3d', 1.25); sofa(380, 245, -0.55, '#3dc9ff', 1.1); sofa(240, 400, -0.9, '#ff4d6d', 1); sofa(760, 250, 0.55, '#3df5a7', 1.05);
      // finish flag
      c.save(); c.translate(860, 70); c.rotate(0.12);
      c.fillStyle = '#ddd'; c.fillRect(-6, 0, 8, 150);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#120f26'; c.fillRect(2 + i * 18, j * 18, 18, 18); }
      c.restore();
      glow(c, 640, 360, 200, '#ffe9a8', 0.2);
      vignette(c, 0.45);
    },
    stop(c) {
      fill(c, linear(c, 0, 0, W, H, [[0, '#ff6a3d'], [0.55, '#e3352b'], [1, '#7a1020']]));
      glow(c, 300, 260, 380, '#ffd23f', 0.45);
      const card = (x, y, a, label, col) => {
        c.save(); c.translate(x, y); c.rotate(a);
        c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, -96, -36, 200, 84, 18); c.fill();
        c.fillStyle = '#fff'; rr(c, -104, -46, 200, 84, 18); c.fill();
        txt(c, label, -84, -14, '700 18px JetBrains Mono', col);
        c.fillStyle = '#e8e3dd'; rr(c, -84, 4, 150, 14, 7); c.fill();
        c.restore();
      };
      card(640, 130, 0.12, 'NOME', '#e3352b'); card(700, 260, -0.08, 'ANIMAL', '#e3352b'); card(620, 390, 0.06, 'CIDADE', '#e3352b');
      c.save(); c.translate(270, 270); c.rotate(-0.08);
      c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, -122, -112, 250, 250, 40); c.fill();
      c.fillStyle = '#fff8e8'; rr(c, -130, -125, 250, 250, 40); c.fill();
      txt(c, 'A', -5, 72, '900 220px Archivo', '#e3352b', 'center');
      c.restore();
      c.save(); c.translate(860, 110); c.rotate(0.15);
      c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 82, Math.sin(a) * 82); } c.closePath(); c.fill();
      c.fillStyle = '#d61f2c'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 72, Math.sin(a) * 72); } c.closePath(); c.fill();
      txt(c, 'STOP', 0, 12, '900 38px Archivo', '#fff', 'center');
      c.restore();
      sparkles(c, 30, '#fff3c4', 9);
    },
    mimica(c) {
      fill(c, linear(c, 0, 0, 0, H, [[0, '#1a0526'], [1, '#3a0b46']]));
      c.fillStyle = linear(c, W / 2, 0, W / 2, H, [[0, 'rgba(255,230,255,.55)'], [1, 'rgba(255,79,216,.08)']]);
      c.beginPath(); c.moveTo(W / 2 - 50, 0); c.lineTo(W / 2 + 50, 0); c.lineTo(W / 2 + 260, H); c.lineTo(W / 2 - 260, H); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.ellipse(W / 2, 470, 240, 44, 0, 0, 7); c.fill();
      // the performer: buddy with gloved "hands" and motion arcs
      const x = W / 2, y = 300;
      for (let k = 0; k < 3; k++) { c.strokeStyle = `rgba(255,255,255,${0.55 - k * 0.15})`; c.lineWidth = 5; c.beginPath(); c.arc(x, y, 150 + k * 26, -2.6, -1.9); c.stroke(); c.beginPath(); c.arc(x, y, 150 + k * 26, -1.25, -0.55); c.stroke(); }
      bud(c, x, y, 100, 1, { mood: 'wow', look: [0, -1] });
      const glove = (gx, gy) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(gx, gy, 30, 0, 7); c.fill(); c.strokeStyle = '#1a1330'; c.lineWidth = 4; c.stroke(); };
      glove(x - 150, y - 110); glove(x + 150, y - 110);
      // the audience, guessing
      const q = (qx, qy, i, s) => { bud(c, qx, qy, 46, i, { mood: 'wow', look: [qx < x ? 1 : -1, -1], alpha: 0.95 }); txt(c, '?', qx + 30, qy - 50, '900 54px Archivo', s, 'center'); };
      q(150, 450, 0, '#ff4fd8'); q(270, 480, 2, '#ffd23f'); q(690, 480, 3, '#3df5a7'); q(810, 450, 4, '#7c9cff');
      sparkles(c, 60, '#ffd6f6', 13);
      vignette(c, 0.5);
    },
    desenho(c) {
      fill(c, linear(c, 0, 0, 0, H, [[0, '#2b1630'], [1, '#170b1d']]));
      for (let x = 0; x < W; x += 60) { c.fillStyle = 'rgba(255,255,255,.025)'; c.fillRect(x, 0, 30, H); }
      const frame = (x, y, w, h, draw, rot) => {
        c.save(); c.translate(x, y); c.rotate(rot);
        glow(c, 0, -h * 0.2, w, '#ffc857', 0.18);
        c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, -w / 2 + 8, -h / 2 + 12, w, h, 6); c.fill();
        c.fillStyle = linear(c, -w / 2, -h / 2, w / 2, h / 2, [[0, '#f2c76a'], [0.5, '#b8862f'], [1, '#f0c25a']]); rr(c, -w / 2, -h / 2, w, h, 6); c.fill();
        c.fillStyle = '#fbfaf6'; c.fillRect(-w / 2 + 16, -h / 2 + 16, w - 32, h - 32);
        draw(); c.restore();
      };
      frame(200, 250, 230, 280, () => { c.strokeStyle = '#1a1330'; c.lineWidth = 7; c.beginPath(); c.arc(0, 10, 54, 0, 7); c.stroke(); stroke(c, '#1a1330', 7, [[-40, -30], [-50, -78], [-14, -50]]); stroke(c, '#1a1330', 7, [[40, -30], [50, -78], [14, -50]]); c.fillStyle = '#1a1330'; c.beginPath(); c.arc(-18, 0, 6, 0, 7); c.arc(18, 0, 6, 0, 7); c.fill(); stroke(c, '#ff7a9a', 5, [[-6, 20], [6, 20]]); }, -0.05);
      frame(480, 210, 260, 200, () => { c.fillStyle = '#ffc857'; c.beginPath(); c.arc(-50, -20, 40, 0, 7); c.fill(); curve(c, '#3d9bff', 10, -110, 60, 0, 10, 110, 60); stroke(c, '#3ecf6e', 8, [[50, 60], [70, 0], [90, 60]]); }, 0.03);
      frame(760, 260, 220, 290, () => { c.fillStyle = '#ff4d6d'; c.beginPath(); c.moveTo(0, -95); c.quadraticCurveTo(46, -40, 30, 50); c.lineTo(-30, 50); c.quadraticCurveTo(-46, -40, 0, -95); c.fill(); c.fillStyle = '#9fe3ff'; c.beginPath(); c.arc(0, -20, 18, 0, 7); c.fill(); c.fillStyle = '#ffc857'; c.beginPath(); c.moveTo(-22, 50); c.lineTo(0, 100); c.lineTo(22, 50); c.fill(); }, 0.06);
      star(c, 480, 380, 30, '#ffc857', 0.2); star(c, 540, 400, 22, '#ffc857', -0.3); star(c, 820, 455, 26, '#ffc857', 0.4);
      for (let i = 0; i < 3; i++) glow(c, 200 + i * 280, -40, 180, '#fff1c9', 0.35);
      vignette(c, 0.55);
    },
    bomba(c) {
      fill(c, radial(c, W / 2, H / 2, W * 0.7, [[0, '#3a0b10'], [1, '#0b0204']]));
      for (let i = -10; i < 30; i++) { c.fillStyle = i % 2 ? 'rgba(255,200,40,.13)' : 'rgba(0,0,0,0)'; c.beginPath(); c.moveTo(i * 50, H - 60); c.lineTo(i * 50 + 50, H - 60); c.lineTo(i * 50 + 10, H); c.lineTo(i * 50 - 40, H); c.closePath(); c.fill(); }
      c.fillStyle = '#1a1a1f'; rr(c, 200, 90, 560, 330, 26); c.fill();
      c.strokeStyle = '#3a3a44'; c.lineWidth = 4; c.stroke();
      for (const [x, y] of [[226, 116], [734, 116], [226, 394], [734, 394]]) { c.fillStyle = '#555'; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); }
      c.fillStyle = '#070708'; rr(c, 290, 130, 380, 130, 14); c.fill();
      glow(c, 480, 195, 220, '#ff2a2a', 0.35);
      txt(c, '02:47', 480, 235, '700 104px JetBrains Mono', '#ff3b3b', 'center');
      const wire = (y, col) => { c.strokeStyle = col; c.lineWidth = 14; c.lineCap = 'round'; c.beginPath(); c.moveTo(250, y); c.bezierCurveTo(380, y - 40, 560, y + 50, 710, y); c.stroke(); c.fillStyle = '#c9c9c9'; c.fillRect(236, y - 12, 20, 24); c.fillRect(704, y - 12, 20, 24); };
      wire(300, '#ff3b3b'); wire(340, '#3d8bff'); wire(380, '#ffd23f');
      for (let i = 0; i < 4; i++) { c.fillStyle = ['#ff3b3b', '#3df5a7', '#ffd23f', '#fff'][i]; c.beginPath(); c.arc(330 + i * 100, 300 + 104, 0.01, 0, 7); c.fill(); }
      [[150, 140], [820, 160], [130, 400], [840, 420]].forEach(([x, y], i) => glow(c, x, y, 70, i % 2 ? '#ff3b3b' : '#ffd23f', 0.3));
      vignette(c, 0.6);
    },
    leilao(c) {
      fill(c, radial(c, W / 2, H * 0.4, W * 0.75, [[0, '#1f7a57'], [0.6, '#0b3a2a'], [1, '#04140e']]));
      glow(c, 480, 230, 300, '#ffe9a8', 0.35);
      c.save(); c.translate(480, 300);
      c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -108, -88, 230, 190, 18); c.fill();
      c.fillStyle = linear(c, -110, -100, 110, 100, [[0, '#8a5cff'], [1, '#4a2ab0']]); rr(c, -115, -95, 230, 190, 18); c.fill();
      c.fillStyle = '#ffc857'; c.fillRect(-18, -95, 36, 190); c.fillRect(-115, -14, 230, 30);
      c.fillStyle = '#ffd57e'; c.beginPath(); c.ellipse(-30, -110, 34, 22, -0.4, 0, 7); c.ellipse(30, -110, 34, 22, 0.4, 0, 7); c.fill();
      txt(c, '?', 0, 84, '900 120px Archivo', 'rgba(255,255,255,.95)', 'center');
      c.restore();
      // gavel
      c.save(); c.translate(760, 180); c.rotate(0.7);
      c.fillStyle = '#7a4a22'; rr(c, -12, 0, 24, 200, 10); c.fill();
      c.fillStyle = linear(c, -70, -40, 70, 40, [[0, '#c98a4a'], [1, '#7a4a22']]); rr(c, -80, -48, 160, 70, 16); c.fill();
      c.fillStyle = '#e8c15a'; c.fillRect(-60, -48, 14, 70); c.fillRect(46, -48, 14, 70);
      c.restore();
      const coin = (x, y, r) => { c.fillStyle = linear(c, x - r, y - r, x + r, y + r, [[0, '#ffe38a'], [1, '#c98f1a']]); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.strokeStyle = '#a8700f'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 0.72, 0, 7); c.stroke(); txt(c, '$', x, y + r * 0.35, `900 ${Math.round(r)}px Archivo`, '#a8700f', 'center'); };
      coin(170, 400, 44); coin(240, 440, 34); coin(120, 300, 30); coin(820, 430, 40); coin(300, 160, 26);
      sparkles(c, 50, '#ffe9a8', 21);
      vignette(c, 0.45);
    },
    pesca(c) {
      fill(c, linear(c, 0, 0, 0, H, [[0, '#7fd8ff'], [0.28, '#2a8fd8'], [0.6, '#0f4fa0'], [1, '#062a5c']]));
      for (let i = 0; i < 7; i++) { c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.moveTo(160 + i * 120, 0); c.lineTo(200 + i * 120, 0); c.lineTo(80 + i * 150, H); c.lineTo(20 + i * 150, H); c.closePath(); c.fill(); }
      for (let k = 0; k < 4; k++) { c.strokeStyle = `rgba(255,255,255,${0.45 - k * 0.08})`; c.lineWidth = 4; c.beginPath(); for (let x = 0; x <= W; x += 20) c.lineTo(x, 150 + k * 12 + Math.sin(x / 40 + k) * 6); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.beginPath(); c.moveTo(560, 0); c.quadraticCurveTo(600, 200, 540, 340); c.stroke();
      c.strokeStyle = '#d8d8d8'; c.lineWidth = 6; c.beginPath(); c.arc(530, 352, 16, 0, Math.PI); c.stroke();
      c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(565, 160, 13, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(565, 160, 13, Math.PI, 0); c.fill();
      const fish = (x, y, s, col, flip) => { c.save(); c.translate(x, y); c.scale(flip ? -s : s, s); c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 60, 34, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(-50, 0); c.lineTo(-96, -32); c.lineTo(-96, 32); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.ellipse(10, -12, 30, 10, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(34, -6, 10, 0, 7); c.fill(); c.fillStyle = '#120f26'; c.beginPath(); c.arc(37, -6, 5, 0, 7); c.fill(); c.restore(); };
      fish(430, 400, 1.2, '#ffd23f', false); fish(760, 330, 0.9, '#ff7a9a', true); fish(180, 300, 0.8, '#3df5a7', false); fish(820, 470, 0.7, '#b47cff', true);
      for (let i = 0; i < 20; i++) { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.beginPath(); c.arc(200 + (i * 137) % 700, 200 + (i * 71) % 320, 3 + (i % 4) * 2, 0, 7); c.stroke(); }
      vignette(c, 0.35);
    },
    quemsou(c) {
      fill(c, linear(c, 0, 0, W, H, [[0, '#ffd23f'], [0.5, '#ff8a5c'], [1, '#ff4fa0']]));
      for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.arc((i * 211) % W, (i * 97) % H, 30 + (i % 3) * 30, 0, 7); c.fill(); }
      const x = W / 2, y = 320;
      bud(c, x, y, 110, 2, { mood: 'wow', look: [0, -1] });
      c.save(); c.translate(x, y - 150); c.rotate(-0.06);
      c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, -84, -52, 176, 110, 16); c.fill();
      c.fillStyle = '#16132b'; rr(c, -90, -60, 180, 112, 18); c.fill();
      c.fillStyle = '#fff'; rr(c, -80, -50, 160, 92, 12); c.fill();
      txt(c, '?', 0, 30, '900 84px Archivo', '#ff4fa0', 'center');
      c.restore();
      const hint = (hx, hy, i, label, flip) => { bud(c, hx, hy, 64, i, { mood: 'happy', look: [flip ? -1 : 1, -0.5] }); c.fillStyle = '#fff'; rr(c, hx - 70, hy - 160, 140, 56, 20); c.fill(); c.beginPath(); c.moveTo(hx - 10, hy - 106); c.lineTo(hx + (flip ? -26 : 26), hy - 82); c.lineTo(hx + 18, hy - 106); c.fill(); txt(c, label, hx, hy - 122, '800 24px Archivo', '#16132b', 'center'); };
      hint(160, 420, 0, 'É verde!', false); hint(800, 420, 4, 'Pula!', true);
      sparkles(c, 40, '#ffffff', 17);
    },
    cabo(c) {
      fill(c, linear(c, 0, 0, W, 0, [[0, '#b3123a'], [0.48, '#ff4d6d'], [0.52, '#3d8bff'], [1, '#1238a8']]));
      c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(W / 2 - 3, 0, 6, H);
      glow(c, W / 2, H / 2, 300, '#ffffff', 0.25);
      const y = 300;
      c.lineCap = 'round'; c.strokeStyle = '#c9a36a'; c.lineWidth = 26; c.beginPath(); c.moveTo(-20, y + 10); c.quadraticCurveTo(W / 2, y - 18, W + 20, y + 10); c.stroke();
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 4; for (let x = 0; x < W; x += 26) { c.beginPath(); c.moveTo(x, y - 8 + Math.pow((x - W / 2) / (W / 2), 2) * 14); c.lineTo(x + 14, y + 12 + Math.pow((x - W / 2) / (W / 2), 2) * 14); c.stroke(); }
      c.fillStyle = '#fff'; c.fillRect(W / 2 - 4, y - 70, 8, 70); c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(W / 2 + 4, y - 70); c.lineTo(W / 2 + 64, y - 52); c.lineTo(W / 2 + 4, y - 34); c.fill();
      bud(c, 120, 330, 60, 0, { mood: 'angry', rot: -0.35, look: [-1, 0] }); bud(c, 250, 320, 56, 4, { mood: 'angry', rot: -0.3, look: [-1, 0] }); bud(c, 360, 316, 50, 5, { mood: 'angry', rot: -0.25, look: [-1, 0] });
      bud(c, 840, 330, 60, 3, { mood: 'angry', rot: 0.35, look: [1, 0] }); bud(c, 710, 320, 56, 2, { mood: 'angry', rot: 0.3, look: [1, 0] }); bud(c, 600, 316, 50, 1, { mood: 'angry', rot: 0.25, look: [1, 0] });
      for (let i = 0; i < 8; i++) { stroke(c, 'rgba(255,255,255,.55)', 4, [[40 + i * 14, 420 + (i % 2) * 20], [10 + i * 14, 420 + (i % 2) * 20]]); }
      sparkles(c, 40, '#ffffff', 23);
      vignette(c, 0.4);
    },
    telefone(c) {
      fill(c, linear(c, 0, 0, W, H, [[0, '#a8e6cf'], [0.5, '#dcedc1'], [1, '#ffaaa5']]));
      const phone = (x, y, rot, draw) => {
        c.save(); c.translate(x, y); c.rotate(rot);
        c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, -82, -142, 176, 300, 30); c.fill();
        c.fillStyle = '#16132b'; rr(c, -90, -150, 180, 300, 30); c.fill();
        c.fillStyle = '#fbfaf6'; rr(c, -78, -132, 156, 266, 18); c.fill();
        draw(); c.restore();
      };
      phone(190, 280, -0.1, () => { txt(c, 'UM GATO', 0, -40, '800 26px Archivo', '#16132b', 'center'); txt(c, 'DE CHAPÉU', 0, -6, '800 26px Archivo', '#16132b', 'center'); txt(c, 'DANÇANDO', 0, 28, '800 26px Archivo', '#16132b', 'center'); });
      phone(480, 260, 0.04, () => { c.strokeStyle = '#16132b'; c.lineWidth = 6; c.beginPath(); c.arc(0, 30, 44, 0, 7); c.stroke(); stroke(c, '#16132b', 6, [[-30, 0], [-38, -40], [-10, -16]]); stroke(c, '#16132b', 6, [[30, 0], [38, -40], [10, -16]]); c.fillStyle = '#ff4d6d'; c.fillRect(-46, -80, 92, 18); c.fillRect(-28, -120, 56, 42); stroke(c, '#3d9bff', 6, [[-60, 90], [-30, 70]]); stroke(c, '#3d9bff', 6, [[60, 90], [30, 70]]); });
      phone(770, 280, 0.12, () => { txt(c, 'UM RATO', 0, -40, '800 26px Archivo', '#16132b', 'center'); txt(c, 'BOMBEIRO', 0, -6, '800 26px Archivo', '#d61f2c', 'center'); txt(c, 'PULANDO?', 0, 28, '800 26px Archivo', '#16132b', 'center'); });
      const arrow = (x0, x1, y) => { c.setLineDash([12, 12]); stroke(c, '#16132b', 5, [[x0, y], [x1, y]]); c.setLineDash([]); stroke(c, '#16132b', 5, [[x1 - 16, y - 12], [x1, y], [x1 - 16, y + 12]]); };
      arrow(296, 372, 270); arrow(588, 664, 270);
      sparkles(c, 30, '#ffffff', 29);
    },
    investigacao(c) {
      fill(c, radial(c, W * 0.55, H * 0.35, W * 0.8, [[0, '#3a2d22'], [0.6, '#1a140f'], [1, '#070504']]));
      for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${i % 2 ? '255,230,200' : '0,0,0'},${0.03 + (i % 5) * 0.01})`; c.fillRect((i * 97) % W, (i * 53) % H, 2, 2); }
      const photo = (x, y, rot, i) => {
        c.save(); c.translate(x, y); c.rotate(rot);
        c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(-62, -70, 132, 156);
        c.fillStyle = '#ece6da'; c.fillRect(-70, -80, 132, 156);
        c.fillStyle = linear(c, 0, -66, 0, 40, [[0, '#4a4440'], [1, '#1c1916']]); c.fillRect(-58, -68, 108, 108);
        c.fillStyle = '#0d0b09'; c.beginPath(); c.arc(-4, -28, 22, 0, 7); c.fill(); c.beginPath(); c.ellipse(-4, 30, 40, 30, 0, Math.PI, 0); c.fill();
        txt(c, 'Nº ' + (12 + i * 7), -56, 64, '500 14px JetBrains Mono', '#5a5248');
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(-4, -82, 7, 0, 7); c.fill();
        c.restore();
      };
      const pins = [[180, 160], [430, 120], [700, 170], [300, 380], [600, 390]];
      c.strokeStyle = '#c0392b'; c.lineWidth = 3;
      [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [1, 4]].forEach(([a, b]) => { c.beginPath(); c.moveTo(pins[a][0], pins[a][1] - 82); c.lineTo(pins[b][0], pins[b][1] - 82); c.stroke(); });
      pins.forEach(([x, y], i) => photo(x, y, (i % 2 ? 1 : -1) * (0.05 + i * 0.02), i));
      c.save(); c.translate(780, 420); c.rotate(-0.18);
      c.strokeStyle = 'rgba(192,57,43,.85)'; c.lineWidth = 6; c.strokeRect(-130, -36, 260, 72);
      txt(c, 'CONFIDENCIAL', 0, 14, '900 38px Archivo', 'rgba(192,57,43,.9)', 'center');
      c.restore();
      c.save(); c.translate(150, 420); c.rotate(-0.5);
      c.strokeStyle = '#c9b48a'; c.lineWidth = 14; c.beginPath(); c.arc(0, 0, 54, 0, 7); c.stroke();
      c.fillStyle = 'rgba(200,230,255,.18)'; c.beginPath(); c.arc(0, 0, 48, 0, 7); c.fill();
      c.fillStyle = '#3a2a1a'; rr(c, 54, -12, 110, 24, 10); c.fill();
      c.restore();
      glow(c, 560, 60, 420, '#ffe2a8', 0.22);
      vignette(c, 0.65);
    },
  };

  function title(c, text, color) {
    c.fillStyle = linear(c, 0, H * 0.48, 0, H, [[0, 'rgba(8,8,10,0)'], [1, 'rgba(8,8,10,.86)']]); c.fillRect(0, H * 0.45, W, H * 0.55);
    let size = 78;
    c.font = `800 ${size}px Archivo`;
    while (c.measureText(text).width > W - 96 && size > 40) { size -= 4; c.font = `800 ${size}px Archivo`; }
    if ('letterSpacing' in c) c.letterSpacing = `${-size * 0.03}px`;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 24; c.shadowOffsetY = 6;
    c.fillStyle = '#fff'; c.fillText(text, 46, H - 50);
    c.shadowColor = 'transparent';
    c.fillStyle = color; c.fillRect(48, H - 34, 64, 6);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
  }

  function draw(id, o = {}) {
    const g = window.CATALOG.byId[id];
    const w = o.w || 960, k = w / W;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    const c = cv.getContext('2d');
    c.scale(k, k);
    (SCENES[id] || ((x) => fill(x, '#222')))(c);
    if (o.title !== false) title(c, g.name, g.color);
    return cv;
  }

  /** A JPEG data URL, cached (covers are drawn once per size). */
  function url(id, o = {}) {
    const key = id + '|' + (o.w || 960) + '|' + (o.title !== false);
    if (!cache[key]) cache[key] = draw(id, o).toDataURL('image/jpeg', 0.9);
    return cache[key];
  }

  /** Waits for the bundled fonts, so titles are never drawn in a fallback font. */
  const ready = () => (document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 60px Archivo'), document.fonts.load('900 60px Archivo'), document.fonts.load('500 20px "JetBrains Mono"')]).catch(() => {}) : Promise.resolve());

  return { draw, url, ready, ids: Object.keys(SCENES) };
})();
