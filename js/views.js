// Drawing: the game board, the live brain map, and the pixel fly at its desk.

(function () {
  const COLORS = {
    I: '#4fd1e8', O: '#f2d544', T: '#b07cf0', S: '#6fdc6a',
    Z: '#f2605b', J: '#4f7cf0', L: '#f29a3c',
  };
  const ROLE_COLOR = {
    eyeL: [94, 220, 255], eyeR: [94, 220, 255], mid: [176, 140, 255],
    out_left: [255, 190, 80], out_right: [255, 190, 80],
    out_rotate: [255, 190, 80], out_drop: [255, 120, 90],
  };

  // ---------------------------------------------------------------- board
  function drawBoard(ctx, game, cell, { ghostLoom } = {}) {
    const W = Tetris.W, H = Tetris.H;
    ctx.fillStyle = '#0a0c11';
    ctx.fillRect(0, 0, W * cell, H * cell);
    // Faint column glow = how hard each column is looming for the fly's eyes.
    if (ghostLoom)
      for (let x = 0; x < W; x++) {
        if (ghostLoom[x] <= 0) continue;
        ctx.fillStyle = `rgba(94,220,255,${0.12 * ghostLoom[x]})`;
        ctx.fillRect(x * cell, 0, cell, H * cell);
      }
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 1; x < W; x++) {
      ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, H * cell); ctx.stroke();
    }
    for (let y = 1; y < H; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(W * cell, y * cell + 0.5); ctx.stroke();
    }
    const block = (x, y, k) => {
      if (y < 0) return;
      ctx.fillStyle = COLORS[k];
      ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, Math.max(2, cell / 7));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x * cell + 1, y * cell + cell - 1 - Math.max(2, cell / 7), cell - 2, Math.max(2, cell / 7));
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (game.board[y][x]) block(x, y, game.board[y][x]);
    if (!game.over) for (const [x, y] of game.pieceCells()) block(x, y, game.piece.kind);
  }

  function drawNext(ctx, kind, size) {
    ctx.clearRect(0, 0, size * 4, size * 3);
    if (!kind) return;
    const cells = { I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]] }[kind];
    ctx.fillStyle = COLORS[kind];
    for (const [x, y] of cells) ctx.fillRect(x * size + 1 + 4, y * size + 1 + size * 0.75, size - 2, size - 2);
  }

  // ---------------------------------------------------------------- brain map
  class BrainView {
    constructor(canvas, brain) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.brain = brain;
      const xyz = brain.slice.xyz;
      // Robust bounds (2nd–98th percentile) so a few far-off cells don't squash the map.
      const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))]; };
      const xs = xyz.map((p) => p[0]), ys = xyz.map((p) => p[1]);
      this.bounds = { x0: pct(xs, 0.02), x1: pct(xs, 0.98), y0: pct(ys, 0.02), y1: pct(ys, 0.98) };
      // Strongest few outgoing connections per neuron, lit up when it fires.
      const { off, tgt, cnt } = brain.out;
      this.topOut = [];
      for (let i = 0; i < brain.n; i++) {
        const list = [];
        for (let e = off[i]; e < off[i + 1]; e++) list.push([tgt[e], cnt[e]]);
        list.sort((a, b) => b[1] - a[1]);
        this.topOut.push(list.slice(0, 3).map((x) => x[0]));
      }
      this.resize();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { x0, x1, y0, y1 } = this.bounds, padX = 70, padY = 26;
      const sx = (this.w - 2 * padX) / (x1 - x0), sy = (this.h - 2 * padY) / (y1 - y0);
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      // Flip x: we look at the fly's brain from behind, as the fly looks at its screen.
      // Small deterministic jitter separates cells whose somas sit on top of each other.
      this.pos = this.brain.slice.xyz.map(([x, y], i) => [
        clamp(padX + sx * (x1 - x), 8, this.w - 8) + (((i * 7919) % 13) - 6) * 0.5,
        clamp(padY + sy * (y - y0), 8, this.h - 8) + (((i * 104729) % 11) - 5) * 0.5,
      ]);
      const groups = {};
      this.brain.role.forEach((r, i) => {
        const k = r.startsWith('out_') ? 'out' : r;
        (groups[k] = groups[k] || []).push(this.pos[i]);
      });
      const centre = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      const cL = centre(groups.eyeL), cR = centre(groups.eyeR);
      this.labels = [
        ['LEFT EYE', [cL[0] < cR[0] ? 34 : this.w - 34, cL[1]], [94, 220, 255]],
        ['RIGHT EYE', [cL[0] < cR[0] ? this.w - 34 : 34, cR[1]], [94, 220, 255]],
        ['BUTTONS', [this.w / 2, this.h - 6], [255, 190, 80]],
      ];
    }
    nearest(px, py) {
      let best = -1, bd = 14 * 14;
      this.pos.forEach(([x, y], i) => {
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    }
    draw(highlight) {
      const { ctx, brain } = this, now = brain.tick;
      ctx.clearRect(0, 0, this.w, this.h);
      const glow = new Float32Array(brain.n);
      for (let i = 0; i < brain.n; i++) glow[i] = Math.exp(-(now - brain.lastSpike[i]) / 1500); // ~150 ms fade
      // Signals travelling along the strongest wires of neurons that just fired.
      ctx.lineWidth = 1;
      for (let i = 0; i < brain.n; i++) {
        if (glow[i] < 0.25) continue;
        const [x, y] = this.pos[i];
        const c = brain.sign[i] < 0 ? '255,90,120' : '200,190,255';
        ctx.strokeStyle = `rgba(${c},${0.35 * glow[i]})`;
        for (const j of this.topOut[i]) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(this.pos[j][0], this.pos[j][1]); ctx.stroke();
        }
      }
      for (let i = 0; i < brain.n; i++) {
        const [x, y] = this.pos[i], [r, g, b] = ROLE_COLOR[brain.role[i]];
        const out = brain.role[i].startsWith('out_');
        const k = glow[i];
        const size = (out ? 3.4 : 2.2) + k * 2.2;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.22 + 0.78 * k})`;
        if (k > 0.5) { ctx.shadowColor = `rgb(${r},${g},${b})`; ctx.shadowBlur = 8 * k; }
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (out && highlight && brain.role[i] === 'out_' + highlight) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, size + 3, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      for (const [text, [x, y], [r, g, b]] of this.labels) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.fillText(text, x, y);
      }
    }
  }

  // ---------------------------------------------------------------- pixel fly
  // Everything is drawn on a tiny 160x120 canvas and scaled up with CSS
  // (image-rendering: pixelated), so every rectangle here is one fat pixel.
  class FlyScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.width = 160; canvas.height = 120;
      this.t = 0;
      this.press = null;
      this.pressAge = 99;
    }
    px(x, y, w = 1, h = 1, c) {
      if (c) this.ctx.fillStyle = c;
      this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }
    ellipse(cx, cy, rx, ry, c) {
      this.ctx.fillStyle = c;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
          if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.ctx.fillRect(x, y, 1, 1);
    }
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      this.ctx.fillStyle = c;
      for (;;) {
        this.ctx.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    pressed(button) {
      this.press = button;
      this.pressAge = 0;
    }
    draw(game, dt) {
      const c = this.ctx;
      this.t += dt;
      this.pressAge += dt;
      const active = this.pressAge < 0.18 ? this.press : null;
      // Room
      c.fillStyle = '#1a1730'; c.fillRect(0, 0, 160, 120);
      c.fillStyle = '#211d3b'; for (let x = 0; x < 160; x += 16) c.fillRect(x, 0, 8, 100);
      c.fillStyle = '#2b2440'; c.fillRect(0, 100, 160, 20);
      c.fillStyle = '#352c50'; for (let x = 0; x < 160; x += 10) c.fillRect(x, 100, 1, 20);
      // Poster on the wall
      this.px(12, 12, 26, 18, '#0d0b1a');
      this.px(14, 14, 22, 14, '#3a2f63');
      this.px(17, 17, 4, 4, '#f2605b'); this.px(21, 17, 4, 4, '#f2605b'); this.px(25, 21, 4, 4, '#4fd1e8'); this.px(21, 21, 4, 4, '#4fd1e8');
      // Desk
      this.px(70, 74, 86, 4, '#7a4a2a'); this.px(70, 78, 86, 2, '#5a341c');
      this.px(74, 80, 3, 20, '#5a341c'); this.px(150, 80, 3, 20, '#5a341c');
      // Monitor
      this.px(98, 12, 42, 60, '#2d2a3a'); this.px(100, 14, 38, 56, '#14121c');
      this.px(114, 70, 10, 4, '#2d2a3a');
      const sx = 109, sy = 22; // mini board 10x20 at 2px
      this.px(sx - 1, sy - 1, 22, 42, '#05060a');
      for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) {
        const k = game.board[y][x];
        if (k) this.px(sx + x * 2, sy + y * 2, 2, 2, COLORS[k]);
      }
      if (!game.over) for (const [x, y] of game.pieceCells()) if (y >= 0) this.px(sx + x * 2, sy + y * 2, 2, 2, COLORS[game.piece.kind]);
      this.px(100, 14, 38, 1, 'rgba(255,255,255,0.08)');
      // Mug
      this.px(144, 66, 6, 8, '#e8e2d0'); this.px(150, 68, 2, 4, '#e8e2d0'); this.px(145, 67, 4, 1, '#5a341c');
      // Stool
      this.px(26, 88, 28, 4, '#4a4560'); this.px(38, 92, 4, 8, '#3a3550'); this.px(30, 98, 20, 2, '#3a3550');

      // --- The fly (side view, facing the monitor) ---
      const bob = Math.round(Math.sin(this.t * 3) * 0.6) + (active ? 1 : 0);
      const fx = 0, fy = bob;
      // Back legs on the stool
      this.line(40, 80 + fy, 34, 88, '#2a1a10'); this.line(46, 80 + fy, 46, 88, '#2a1a10');
      // Wings (buzz when DROP is pressed)
      const buzz = active === 'drop' ? (Math.floor(this.t * 40) % 2 ? -2 : 1) : 0;
      this.ellipse(32 + fx, 66 + fy + buzz, 15, 4, 'rgba(210,230,255,0.45)');
      this.ellipse(34 + fx, 69 + fy - buzz, 13, 3, 'rgba(210,230,255,0.3)');
      this.line(22, 66 + fy + buzz, 44, 67 + fy + buzz, 'rgba(160,180,210,0.6)');
      // Abdomen with stripes
      this.ellipse(36 + fx, 80 + fy, 10, 7, '#c99a5e');
      for (let i = 0; i < 4; i++) this.px(29 + i * 4 + fx, 75 + fy, 2, 11, '#6b4426');
      this.ellipse(36 + fx, 80 + fy, 10, 7, 'rgba(0,0,0,0)');
      // Thorax
      this.ellipse(49 + fx, 72 + fy, 7, 7, '#8a5a32');
      this.px(45 + fx, 67 + fy, 6, 2, '#a8723f');
      // Head + giant red eye
      this.ellipse(58 + fx, 64 + fy, 6, 6, '#8a5a32');
      this.ellipse(59 + fx, 63 + fy, 4, 5, '#d0281e');
      this.px(60 + fx, 60 + fy, 2, 2, '#ff8a7a');
      for (let i = 0; i < 3; i++) this.px(57 + fx + i, 64 + fy + (i % 2) * 2, 1, 1, '#9c1a12');
      // Antenna
      this.line(62, 59 + fy, 64, 56 + fy, '#2a1a10'); this.px(64, 55 + fy, 2, 1, '#2a1a10');
      // Front legs holding the controller
      const reach = active === 'left' ? -2 : active === 'right' ? 2 : 0;
      this.line(53, 74 + fy, 63 + reach, 76, '#2a1a10');
      this.line(51, 76 + fy, 70, 78, '#2a1a10');
      // Controller
      this.px(60, 75, 16, 6, '#cfc8e0'); this.px(61, 81, 4, 2, '#cfc8e0'); this.px(71, 81, 4, 2, '#cfc8e0');
      const lit = (b) => (active === b ? '#ffe066' : '#5a5470');
      this.px(62, 77, 1, 1, lit('left')); this.px(64, 77, 1, 1, lit('right'));
      this.px(63, 76, 1, 1, '#5a5470'); this.px(63, 78, 1, 1, lit('drop'));
      this.px(71, 77, 2, 2, lit('rotate')); this.px(73, 76, 2, 1, '#5a5470');
      this.px(66, 76, 3, 1, '#7a7490');
      // Speech bubble with the pressed button
      if (active) {
        const sym = { left: '<', right: '>', rotate: '@', drop: 'v' }[active];
        this.px(62, 38, 18, 12, '#f4f0ff'); this.px(64, 50, 3, 2, '#f4f0ff'); this.px(63, 52, 2, 1, '#f4f0ff');
        c.fillStyle = '#1a1730';
        c.font = '10px "Press Start 2P", monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(sym, 71, 45);
      }
      if (game.over) {
        c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(100, 14, 38, 56);
        c.fillStyle = '#f2605b'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
        c.fillText('GAME', 119, 38); c.fillText('OVER', 119, 46);
      }
    }
  }

  window.Views = { drawBoard, drawNext, BrainView, FlyScene, COLORS };
})();
