// Wires it all together: every decision window (120 ms of neural time) the
// fly looks at the board, its brain runs, and the button neurons get a vote.

(function () {
  const WINDOW_MS = 120;  // neural time per decision
  const GRAVITY_MS = 650; // piece falls one row this often (game time)
  const $ = (id) => document.getElementById(id);

  const brain = new FlyBrain(window.BRAIN_SLICE);
  const iface = new FlyInterface(brain);
  const game = new Tetris();
  const brainView = new Views.BrainView($('brain'), brain);
  const scene = new Views.FlyScene($('scene'));
  const boardCtx = $('board').getContext('2d');
  const nextCtx = $('next').getContext('2d');

  const state = {
    speed: 1, paused: false, carry: 0, gravity: 0,
    games: 0, best: 0, history: [],
    presses: { left: 0, right: 0, rotate: 0, drop: 0 },
    lastDecision: null, restartAt: null, poke: [],
  };

  let cell = 24;
  function sizeBoard() {
    const wrap = $('board-wrap');
    const avail = Math.min(wrap.clientHeight || 520, 560);
    cell = Math.max(14, Math.floor(avail / Tetris.H));
    const c = $('board'), dpr = window.devicePixelRatio || 1;
    c.style.width = cell * Tetris.W + 'px';
    c.style.height = cell * Tetris.H + 'px';
    c.width = cell * Tetris.W * dpr;
    c.height = cell * Tetris.H * dpr;
    boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = $('next');
    n.width = 64; n.height = 48;
    brainView.resize();
  }
  window.addEventListener('resize', sizeBoard);

  // ------------------------------------------------------------ the loop
  function decisionStep() {
    const loom = iface.see(game);
    // Applies any "poke" stimulation the visitor clicked on the brain map.
    state.poke = state.poke.filter((p) => p.until > brain.timeMs);
    for (const p of state.poke) brain.rates[p.id] = Math.max(brain.rates[p.id], 400);
    brain.run(WINDOW_MS);
    const d = iface.decide(brain.takeSpikes(), WINDOW_MS);
    d.loom = loom;
    state.lastDecision = d;
    if (game.over || !d.press) return;
    let ok = false;
    if (d.press === 'left') ok = game.move(-1);
    else if (d.press === 'right') ok = game.move(1);
    else if (d.press === 'rotate') ok = game.rotate();
    else if (d.press === 'drop') { game.softDrop(); ok = true; }
    state.presses[d.press]++;
    scene.pressed(d.press);
    log(d.press, d.z[d.press], ok);
  }

  function gameStep(ms) {
    if (game.over) {
      if (state.restartAt === null) {
        state.games++;
        state.best = Math.max(state.best, game.score);
        state.history.push(game.score);
        if (state.history.length > 40) state.history.shift();
        state.restartAt = performance.now() + 1800 / state.speed;
        logLine(`Game ${state.games} over · ${game.score} pts · ${game.lines} lines`, 'over');
      } else if (performance.now() > state.restartAt) {
        state.restartAt = null;
        game.reset();
      }
      return;
    }
    state.gravity += ms;
    while (state.gravity >= GRAVITY_MS) {
      state.gravity -= GRAVITY_MS;
      const cleared = game.softDrop();
      if (cleared > 0) logLine(`The fly cleared ${cleared} line${cleared > 1 ? 's' : ''}!`, 'win');
    }
  }

  let last = performance.now();
  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      const simMs = realDt * 1000 * state.speed;
      state.carry += simMs;
      let guard = 0;
      while (state.carry >= WINDOW_MS && guard++ < 40) {
        state.carry -= WINDOW_MS;
        decisionStep();
        gameStep(WINDOW_MS);
      }
    }
    render(realDt);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ UI
  const LABEL = { left: '◀ LEFT', right: 'RIGHT ▶', rotate: '⟳ ROTATE', drop: '▼ DROP' };
  const NEURONS = { left: 'DNa02 · DNa11 · DNg13 (L)', right: 'DNa02 · DNa11 · DNg13 (R)', rotate: 'DNp09 · DNg100 · DNg97', drop: 'DNp01 · MDN' };

  function buildMeters() {
    const box = $('meters');
    for (const c of FlyInterface.CHANNELS) {
      const row = document.createElement('div');
      row.className = 'meter';
      row.id = 'm-' + c;
      row.innerHTML = `<span class="m-label">${LABEL[c]}</span><span class="m-bar"><i></i><b></b></span><span class="m-val">0</span><span class="m-neurons">${NEURONS[c]}</span>`;
      box.appendChild(row);
    }
  }

  function render(dt) {
    Views.drawBoard(boardCtx, game, cell, { ghostLoom: state.lastDecision && state.lastDecision.loom });
    Views.drawNext(nextCtx, game.next, 14);
    scene.draw(game, dt);
    brainView.draw(scene.pressAge < 0.25 ? scene.press : null);
    const d = state.lastDecision;
    if (d) {
      for (const c of FlyInterface.CHANNELS) {
        const row = $('m-' + c), z = d.z[c] || 0;
        row.querySelector('i').style.width = Math.max(0, Math.min(100, (z / 4) * 100)) + '%';
        row.querySelector('b').style.left = (iface.threshold / 4) * 100 + '%';
        row.querySelector('.m-val').textContent = Math.round(d.rates[c]) + ' Hz';
        row.classList.toggle('on', scene.pressAge < 0.25 && scene.press === c);
      }
      $('warm').hidden = d.warm;
    }
    $('score').textContent = game.score;
    $('lines').textContent = game.lines;
    $('games').textContent = state.games;
    $('best').textContent = state.best;
    $('ntime').textContent = (brain.timeMs / 1000).toFixed(1) + ' s';
    const p = state.presses;
    $('presses').textContent = `◀${p.left}  ▶${p.right}  ⟳${p.rotate}  ▼${p.drop}`;
    drawHistory();
  }

  function drawHistory() {
    const c = $('history'), ctx = c.getContext('2d');
    const w = (c.width = c.clientWidth * 2), h = (c.height = c.clientHeight * 2);
    ctx.clearRect(0, 0, w, h);
    const hs = state.history;
    if (!hs.length) {
      ctx.fillStyle = 'rgba(232,226,255,0.35)';
      ctx.font = '22px VT323, monospace';
      ctx.fillText('Waiting for the first game to end…', 8, h / 2 + 6);
      return;
    }
    const max = Math.max(...hs, 50), bw = w / 40;
    hs.forEach((s, i) => {
      const bh = (s / max) * (h - 6);
      ctx.fillStyle = s === state.best ? '#ffbe50' : '#8c6cff';
      ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    });
  }

  const logEl = $('log');
  function logLine(text, cls = '') {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    logEl.prepend(li);
    while (logEl.children.length > 7) logEl.lastChild.remove();
  }
  let lastLogged = 0;
  function log(press, z, ok) {
    const now = performance.now();
    if (now - lastLogged < 450) return; // keep it readable
    lastLogged = now;
    logLine(`${LABEL[press]}  ·  ${NEURONS[press].split(' ·')[0]} group +${z.toFixed(1)}σ${ok ? '' : '  (bonk)'}`);
  }

  // Controls
  document.querySelectorAll('[data-speed]').forEach((b) =>
    b.addEventListener('click', () => {
      state.speed = +b.dataset.speed;
      document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }),
  );
  $('pause').addEventListener('click', () => {
    state.paused = !state.paused;
    $('pause').textContent = state.paused ? 'Resume' : 'Pause';
  });
  $('restart').addEventListener('click', () => {
    game.reset();
    state.restartAt = null;
    logLine('New game.');
  });
  $('brain').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = brainView.nearest(e.clientX - r.left, e.clientY - r.top);
    if (id < 0) return;
    state.poke.push({ id, until: brain.timeMs + 300 });
    const s = brain.slice;
    logLine(`You poked ${s.type[id]} (${s.side[id] || '-'}) · neuron #${s.id[id]}`, 'poke');
  });
  $('brain').addEventListener('mousemove', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = brainView.nearest(e.clientX - r.left, e.clientY - r.top);
    const s = brain.slice;
    $('hover').textContent = id < 0 ? 'Hover a neuron · click to poke it'
      : `${s.type[id]} · ${s.side[id] || '?'} side · ${s.nt[id]} · id ${s.id[id]}`;
  });

  buildMeters();
  sizeBoard();
  $('count').textContent = brain.n;
  $('edges').textContent = (brain.slice.edges.length / 3).toLocaleString();
  logLine('The fly sits down at the desk…');
  requestAnimationFrame(frame);
})();
