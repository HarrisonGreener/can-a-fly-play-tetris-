// The "controller": how the game gets into the fly's brain, and how the
// brain's activity becomes button presses.
//
// IN  — The eye neurons in this slice are LC4 and LPLC2, the fly's looming
//       detectors (they fire when something is about to hit it). Each eye
//       neuron is assigned a column of the board: left eye watches columns
//       0-4, right eye watches 5-9. Falling blocks get "closer" as they drop,
//       so they loom harder; tall stacks loom too.
//
// OUT — Four groups of real descending neurons (the cells that carry
//       commands from brain to body) are wired to the buttons:
//         LEFT   DNa02 / DNa11 / DNg13, left side   (turn-left neurons)
//         RIGHT  DNa02 / DNa11 / DNg13, right side  (turn-right neurons)
//         ROTATE DNp09 / DNg100 / DNg97            (walk-forward neurons)
//         DROP   DNp01 (giant fibre) / MDN           (escape / back-up neurons)
//       Every decision window, each group's firing rate is compared with its
//       own recent average. The group that is most unusually active (by more
//       than a threshold) presses its button. Nothing is trained.

(function () {
  const CHANNELS = ['left', 'right', 'rotate', 'drop'];
  const W = 10, H = 20;

  class FlyInterface {
    constructor(brain, { threshold = 1.1, floorHz = 3 } = {}) {
      this.brain = brain;
      this.threshold = threshold;
      this.floorHz = floorHz;
      const role = brain.role, xyz = brain.slice.xyz;
      const by = (r) => role.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0);

      this.groups = {};
      for (const c of CHANNELS) this.groups[c] = by('out_' + c);
      this.mid = by('mid');

      // Pseudo-retinotopy: sort each eye's neurons top-to-bottom by soma
      // position, then deal them out across that eye's five columns.
      this.eyeCol = new Map();
      const deal = (ids, first) =>
        ids.sort((a, b) => xyz[a][1] - xyz[b][1]).forEach((id, k) => this.eyeCol.set(id, first + (k % 5)));
      deal(by('eyeL'), 0);
      deal(by('eyeR'), 5);

      // A little spontaneous activity, like a real brain at rest.
      for (const i of this.mid) brain.background[i] = 3;
      for (const c of CHANNELS) for (const i of this.groups[c]) brain.background[i] = 2;

      this.mean = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
      this.var = Object.fromEntries(CHANNELS.map((c) => [c, 100]));
      this.windows = 0;
      this.loom = new Float32Array(W);
    }

    /** Turn the board into eye-neuron firing rates. */
    see(game) {
      const loom = this.loom.fill(0);
      if (!game.over) {
        for (const [x, y] of game.pieceCells()) {
          if (x < 0 || x >= W) continue;
          const closeness = Math.max(0, (y + 1) / H); // 0 at top, 1 at bottom
          loom[x] = Math.max(loom[x], 0.35 + 0.65 * closeness);
        }
      }
      const h = game.heights();
      for (let x = 0; x < W; x++) loom[x] = Math.min(1, loom[x] + 0.6 * (h[x] / H));
      for (const [id, col] of this.eyeCol) this.brain.rates[id] = 240 * loom[col];
      return loom;
    }

    /** Read the output neurons and decide which button (if any) to press. */
    decide(spikes, windowMs) {
      const rates = {}, z = {};
      let best = null, bestZ = this.threshold;
      const warm = this.windows > 12;
      const a = this.windows < 12 ? 0.3 : 0.06; // learn baselines fast at first
      for (const c of CHANNELS) {
        const ids = this.groups[c];
        let s = 0;
        for (const i of ids) s += spikes[i];
        const r = (rates[c] = ids.length ? (s / ids.length) * (1000 / windowMs) : 0);
        const sd = Math.sqrt(this.var[c] + this.floorHz * this.floorHz);
        z[c] = (r - this.mean[c]) / sd;
        if (warm && z[c] > bestZ) { bestZ = z[c]; best = c; }
        const d = r - this.mean[c];
        this.mean[c] += a * d;
        this.var[c] = (1 - a) * (this.var[c] + a * d * d);
      }
      this.windows++;
      return { press: best, z, rates, warm };
    }
  }

  FlyInterface.CHANNELS = CHANNELS;
  window.FlyInterface = FlyInterface;
})();
