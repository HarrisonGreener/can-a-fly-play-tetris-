// 2D drawing: the game as it appears on the CRT, and the live brain readout.

(function () {
  const COLORS = {
    I: '#4fd1e8', O: '#f2d544', T: '#b07cf0', S: '#6fdc6a',
    Z: '#f2605b', J: '#5b86ff', L: '#f29a3c',
  };
  const SHAPES = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };

  // ---------------------------------------------------------------- CRT
  /** Draw the game onto the computer screen: 4:3, phosphor glow, scanlines. */
  function drawCRT(ctx, w, h, game, info) {
    ctx.fillStyle = '#05080b';
    ctx.fillRect(0, 0, w, h);
    const cell = Math.floor((h - 40) / Tetris.H), bw = cell * Tetris.W, bh = cell * Tetris.H;
    const ox = Math.round((w - bw) / 2), oy = 20;
    // Column glow = what the fly's eyes are seeing.
    if (info.loom)
      for (let x = 0; x < Tetris.W; x++) {
        ctx.fillStyle = `rgba(90,200,255,${0.13 * info.loom[x]})`;
        ctx.fillRect(ox + x * cell, oy, cell, bh);
      }
    ctx.strokeStyle = 'rgba(160,220,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 4, oy - 4, bw + 8, bh + 8);
    const block = (x, y, k) => {
      if (y < 0) return;
      const px = ox + x * cell, py = oy + y * cell;
      ctx.fillStyle = COLORS[k];
      ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(px + 1, py + 1, cell - 2, 3);
    };
    for (let y = 0; y < Tetris.H; y++) for (let x = 0; x < Tetris.W; x++) if (game.board[y][x]) block(x, y, game.board[y][x]);
    if (!game.over) for (const [x, y] of game.pieceCells()) block(x, y, game.piece.kind);
    // Side readouts
    ctx.fillStyle = '#bfe6ff';
    ctx.font = '600 22px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    const lx = 26;
    const rows = [['SCORE', game.score], ['LINES', game.lines], ['GAME', info.games + 1]];
    rows.forEach(([k, v], i) => {
      ctx.globalAlpha = 0.55; ctx.fillText(k, lx, 70 + i * 74);
      ctx.globalAlpha = 1; ctx.fillText(String(v), lx, 98 + i * 74);
    });
    const rx = ox + bw + 34;
    ctx.globalAlpha = 0.55; ctx.fillText('NEXT', rx, 70); ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS[game.next];
    for (const [x, y] of SHAPES[game.next]) ctx.fillRect(rx + x * 22, 90 + y * 22, 20, 20);
    if (info.press) {
      ctx.fillStyle = '#ffe28a';
      ctx.font = '700 40px "IBM Plex Mono", monospace';
      ctx.fillText({ left: '◀', right: '▶', rotate: '⟳', drop: '▼' }[info.press], rx, h - 60);
    }
    if (game.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ox, oy, bw, bh);
      ctx.fillStyle = '#ff6a5a'; ctx.textAlign = 'center';
      ctx.font = '700 34px "IBM Plex Mono", monospace';
      ctx.fillText('GAME OVER', w / 2, h / 2);
    }
    // Scanlines + vignette
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  // ---------------------------------------------------------------- brain map
  // Black on white, like a lab readout. Neurons sit at their real soma
  // positions; firing cells flash red (the colour of the fly's eyes).
  const BASE = { eyeL: '17,17,17', eyeR: '17,17,17', mid: '150,150,150' };
  class BrainView {
    constructor(canvas, brain) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.brain = brain;
      const xyz = brain.slice.xyz;
      const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))]; };
      const xs = xyz.map((p) => p[0]), ys = xyz.map((p) => p[1]);
      this.bounds = { x0: pct(xs, 0.02), x1: pct(xs, 0.98), y0: pct(ys, 0.02), y1: pct(ys, 0.98) };
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
      if (!r.width) return;
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { x0, x1, y0, y1 } = this.bounds, padX = 54, padY = 20;
      const sx = (this.w - 2 * padX) / (x1 - x0), sy = (this.h - 2 * padY) / (y1 - y0);
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      // Flipped so the fly's left is on the left: we look from behind, as the fly looks at its screen.
      this.pos = this.brain.slice.xyz.map(([x, y], i) => [
        clamp(padX + sx * (x1 - x), 6, this.w - 6) + (((i * 7919) % 13) - 6) * 0.45,
        clamp(padY + sy * (y - y0), 6, this.h - 6) + (((i * 104729) % 11) - 5) * 0.45,
      ]);
      const centre = (r) => {
        const pts = this.pos.filter((_, i) => this.brain.role[i] === r);
        return pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      };
      const L = centre('eyeL'), R = centre('eyeR');
      this.labels = [['L EYE', 22, L[1]], ['R EYE', this.w - 22, R[1]]];
    }
    nearest(px, py) {
      let best = -1, bd = 12 * 12;
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
      for (let i = 0; i < brain.n; i++) glow[i] = Math.exp(-(now - brain.lastSpike[i]) / 600); // ~60 ms fade
      ctx.lineWidth = 0.8;
      for (let i = 0; i < brain.n; i++) {
        if (glow[i] < 0.5) continue;
        const [x, y] = this.pos[i];
        ctx.strokeStyle = brain.sign[i] < 0 ? `rgba(214,36,28,${0.45 * glow[i]})` : `rgba(0,0,0,${0.32 * glow[i]})`;
        for (const j of this.topOut[i]) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(this.pos[j][0], this.pos[j][1]); ctx.stroke();
        }
      }
      for (let i = 0; i < brain.n; i++) {
        const [x, y] = this.pos[i], role = brain.role[i], out = role.startsWith('out_'), k = glow[i];
        const r = (out ? 3.2 : 1.9) + k * 2.2;
        if (out) {
          ctx.fillStyle = k > 0.6 ? '#d6241c' : '#fff';
          ctx.strokeStyle = '#d6241c'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (highlight && role === 'out_' + highlight) {
            ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
          }
        } else {
          ctx.fillStyle = k > 0.6 ? `rgba(214,36,28,${0.4 + 0.6 * k})` : `rgba(${BASE[role]},${0.55 + 0.45 * k})`;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.fillStyle = '#000';
      ctx.font = '600 9px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      for (const [t, x, y] of this.labels) ctx.fillText(t, x, y);
    }
  }

  window.Views = { drawCRT, BrainView, COLORS };
})();
