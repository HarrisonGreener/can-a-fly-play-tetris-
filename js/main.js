// Wires it all together. Every decision window (120 ms of neural time) the
// fly looks at the board, its brain runs, and the button neurons get a vote.
// The 3D world renders the fly tapping whichever key won.

window.startApp = function () {
  const WINDOW_MS = 120;  // neural time per decision
  const GRAVITY_MS = 650; // piece falls one row this often (game time)
  const $ = (id) => document.getElementById(id);

  const brain = new FlyBrain(window.BRAIN_SLICE);
  const iface = new FlyInterface(brain);
  const game = new Tetris();
  const brainView = new Views.BrainView($('brain'), brain);

  let world;
  try {
    world = new World($('world'), window.FLY_BODY);
  } catch (e) {
    console.error(e);
    $('loading').textContent = 'This needs WebGL — try a recent Chrome, Edge, Firefox or Safari.';
    return;
  }
  $('loading').classList.add('done');

  const state = {
    speed: 1, paused: false, carry: 0, gravity: 0,
    games: 0, best: 0, history: [],
    presses: { left: 0, right: 0, rotate: 0, drop: 0 },
    last: null, lastPress: null, lastPressAt: -1e9, restartAt: null, poke: [],
  };

  function decisionStep() {
    const loom = iface.see(game);
    state.poke = state.poke.filter((p) => p.until > brain.timeMs);
    for (const p of state.poke) brain.rates[p.id] = Math.max(brain.rates[p.id], 400);
    brain.run(WINDOW_MS);
    const d = iface.decide(brain.takeSpikes(), WINDOW_MS);
    d.loom = loom;
    state.last = d;
    if (game.over || !d.press) return;
    let ok = false;
    if (d.press === 'left') ok = game.move(-1);
    else if (d.press === 'right') ok = game.move(1);
    else if (d.press === 'rotate') ok = game.rotate();
    else if (d.press === 'drop') { game.softDrop(); ok = true; }
    state.presses[d.press]++;
    state.lastPress = d.press;
    state.lastPressAt = performance.now();
    world.press(d.press);
    log(d.press, d.z[d.press], ok);
  }

  function gameStep(ms) {
    if (game.over) {
      if (state.restartAt === null) {
        state.games++;
        state.best = Math.max(state.best, game.score);
        state.history.push(game.score);
        if (state.history.length > 40) state.history.shift();
        state.restartAt = performance.now() + 2200 / state.speed;
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
      if (cleared > 0) logLine(`The fly cleared ${cleared} line${cleared > 1 ? 's' : ''}.`, 'win');
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      state.carry += dt * 1000 * state.speed;
      let guard = 0;
      while (state.carry >= WINDOW_MS && guard++ < 40) {
        state.carry -= WINDOW_MS;
        decisionStep();
        gameStep(WINDOW_MS);
      }
    }
    const recent = performance.now() - state.lastPressAt < 260 ? state.lastPress : null;
    world.drawScreen((ctx, w, h) =>
      Views.drawCRT(ctx, w, h, game, { loom: state.last && state.last.loom, games: state.games, press: recent }));
    world.render(dt);
    brainView.draw(recent);
    updateHud(recent);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ HUD
  const LABEL = { left: '← Left', right: '→ Right', rotate: '↑ Rotate', drop: '↓ Drop' };
  const NEURONS = { left: 'DNa02 · DNa11 · DNg13 (L)', right: 'DNa02 · DNa11 · DNg13 (R)', rotate: 'DNp09 · DNg100 · DNg97', drop: 'DNp01 · MDN' };
  for (const c of FlyInterface.CHANNELS) {
    const row = document.createElement('div');
    row.className = 'meter';
    row.id = 'm-' + c;
    row.innerHTML = `<span class="m-label">${LABEL[c]}</span><span class="m-bar"><i></i><b></b></span><span class="m-val">0</span><span class="m-neurons">${NEURONS[c]}</span>`;
    $('meters').appendChild(row);
  }
  function updateHud(recent) {
    const d = state.last;
    if (d) {
      for (const c of FlyInterface.CHANNELS) {
        const row = $('m-' + c), z = d.z[c] || 0;
        row.querySelector('i').style.width = Math.max(0, Math.min(100, (z / 4) * 100)) + '%';
        row.querySelector('b').style.left = (iface.threshold / 4) * 100 + '%';
        row.querySelector('.m-val').textContent = Math.round(d.rates[c]) + ' Hz';
        row.classList.toggle('on', recent === c);
      }
      $('warm').hidden = d.warm;
    }
    $('score').textContent = game.score;
    $('lines').textContent = game.lines;
    $('games').textContent = state.games;
    $('best').textContent = state.best;
    $('ntime').textContent = (brain.timeMs / 1000).toFixed(1) + ' s';
    const p = state.presses;
    $('presses').textContent = `← ${p.left}   → ${p.right}   ↑ ${p.rotate}   ↓ ${p.drop}`;
    drawHistory();
  }
  function drawHistory() {
    const c = $('history'), ctx = c.getContext('2d');
    const w = (c.width = c.clientWidth * 2), h = (c.height = c.clientHeight * 2);
    ctx.clearRect(0, 0, w, h);
    const hs = state.history;
    if (!hs.length) {
      ctx.fillStyle = '#888';
      ctx.font = '22px "IBM Plex Mono", monospace';
      ctx.fillText('waiting for the first game to end', 0, h / 2 + 8);
      return;
    }
    const max = Math.max(...hs, 50), bw = w / 40;
    hs.forEach((s, i) => {
      const bh = Math.max(2, (s / max) * (h - 4));
      ctx.fillStyle = s === state.best ? '#d6241c' : '#111';
      ctx.fillRect(i * bw, h - bh, bw - 3, bh);
    });
  }
  const logEl = $('log');
  function logLine(text, cls = '') {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    logEl.prepend(li);
    while (logEl.children.length > 6) logEl.lastChild.remove();
  }
  let lastLogged = 0;
  function log(press, z, ok) {
    const now = performance.now();
    if (now - lastLogged < 450) return;
    lastLogged = now;
    logLine(`${LABEL[press]}   ${NEURONS[press].split(' ·')[0]} +${z.toFixed(1)}σ${ok ? '' : '   bonk'}`);
  }

  // ------------------------------------------------------------ controls
  const group = (sel, fn) => document.querySelectorAll(sel).forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', x === b));
      fn(b);
    }));
  group('[data-speed]', (b) => (state.speed = +b.dataset.speed));
  group('[data-cam]', (b) => world.director.setMode(b.dataset.cam));
  $('pause').addEventListener('click', () => {
    state.paused = !state.paused;
    $('pause').textContent = state.paused ? 'Resume' : 'Pause';
  });
  $('restart').addEventListener('click', () => { game.reset(); state.restartAt = null; logLine('New game.'); });
  const brainEl = $('brain');
  brainEl.addEventListener('click', (e) => {
    const r = brainEl.getBoundingClientRect(), id = brainView.nearest(e.clientX - r.left, e.clientY - r.top);
    if (id < 0) return;
    state.poke.push({ id, until: brain.timeMs + 300 });
    const s = brain.slice;
    logLine(`You poked ${s.type[id]} (${s.side[id] || '–'}) #${s.id[id]}`, 'poke');
  });
  brainEl.addEventListener('mousemove', (e) => {
    const r = brainEl.getBoundingClientRect(), id = brainView.nearest(e.clientX - r.left, e.clientY - r.top), s = brain.slice;
    $('hover').textContent = id < 0 ? 'Hover a neuron · click to poke it' : `${s.type[id]} · ${s.side[id] || '?'} side · ${s.nt[id]} · #${s.id[id]}`;
  });
  window.addEventListener('resize', () => brainView.resize());

  $('count').textContent = brain.n;
  $('edges').textContent = (brain.slice.edges.length / 3).toLocaleString();
  logLine('The fly approaches the keyboard.');
  requestAnimationFrame(frame);
  window.__fly = { world, game, brain, state };
};
