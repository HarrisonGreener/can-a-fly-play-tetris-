// FlyBrain: a leaky integrate-and-fire (LIF) simulation of a small slice of the
// real MaleCNS fruit-fly connectome. Every connection weight is a real synapse
// count from the dataset; nothing here is trained or fitted.
//
// Model and parameters adapted from Shiu et al. (2024, Nature) via
// Xenova/fruit-fly-simulation (MIT-licensed application code).

(function () {
  const P = Object.freeze({
    dt: 0.1,          // ms per tick
    rest: -52,        // mV
    threshold: -45,   // mV
    tauM: 20,         // membrane time constant, ms
    tauS: 5,          // synaptic time constant, ms
    refractory: 22,   // ticks (2.2 ms)
    delay: 18,        // ticks (1.8 ms) synaptic delay
    synapse: 0.275,   // mV per synapse
    poissonWeight: 68.75,
  });
  const EM = Math.exp(-P.dt / P.tauM);
  const ES = Math.exp(-P.dt / P.tauS);
  const COUPLING = (P.tauS / (P.tauM - P.tauS)) * (EM - ES);
  const RING = P.delay + 1;

  class FlyBrain {
    constructor(slice) {
      this.slice = slice;
      const n = (this.n = slice.id.length);
      this.sign = Float32Array.from(slice.sign);
      this.role = slice.role;

      // Edges arrive flat as [pre, post, synapses, pre, post, synapses, ...].
      // Build an outgoing adjacency list (CSR) for fast spike delivery.
      const E = slice.edges, m = E.length / 3;
      const off = new Uint32Array(n + 1);
      for (let k = 0; k < m; k++) off[E[3 * k] + 1]++;
      for (let i = 0; i < n; i++) off[i + 1] += off[i];
      const cur = off.slice(), tgt = new Uint32Array(m), cnt = new Float32Array(m);
      for (let k = 0; k < m; k++) {
        const e = cur[E[3 * k]]++;
        tgt[e] = E[3 * k + 1];
        cnt[e] = E[3 * k + 2];
      }
      this.out = { off, tgt, cnt };
      this.rates = new Float32Array(n);      // external Poisson drive (Hz)
      this.background = new Float32Array(n); // spontaneous drive (Hz)
      this.reset();
    }

    reset() {
      const n = this.n;
      this.v = new Float32Array(n).fill(P.rest);
      this.g = new Float32Array(n);
      this.until = new Float64Array(n);
      this.lastSpike = new Float64Array(n).fill(-1e9); // tick of last spike
      this.spikes = new Uint32Array(n);                 // counts since last read
      this.ring = Array.from({ length: RING }, () => []);
      this.tick = 0;
      this.totalSpikes = 0;
    }

    /** Advance the brain by `ms` milliseconds of neural time. */
    run(ms) {
      const steps = Math.round(ms / P.dt);
      const { v, g, until, sign, rates, background, out } = this;
      const n = this.n;
      for (let s = 0; s < steps; s++) {
        const t = this.tick;
        const fired = [];
        for (let i = 0; i < n; i++) {
          if (t < until[i]) continue;
          v[i] = P.rest + (v[i] - P.rest) * EM + g[i] * COUPLING;
          g[i] *= ES;
          if (v[i] > P.threshold) fired.push(i);
        }
        // Deliver spikes that left their source `delay` ticks ago.
        const due = this.ring[t % RING];
        for (let d = 0; d < due.length; d++) {
          const i = due[d], w = sign[i] * P.synapse;
          if (!w) continue;
          for (let e = out.off[i]; e < out.off[i + 1]; e++) {
            const j = out.tgt[e];
            if (t >= until[j]) g[j] += out.cnt[e] * w;
          }
        }
        // External input: Poisson kicks (what the eyes see + background).
        for (let i = 0; i < n; i++) {
          const r = rates[i] + background[i];
          if (r > 0 && t >= until[i] && Math.random() < (r * P.dt) / 1000) v[i] += P.poissonWeight;
        }
        for (let f = 0; f < fired.length; f++) {
          const i = fired[f];
          v[i] = P.rest;
          g[i] = 0;
          until[i] = t + (rates[i] > 0 ? 0 : P.refractory);
          this.lastSpike[i] = t;
          this.spikes[i]++;
        }
        this.totalSpikes += fired.length;
        this.ring[t % RING] = [];
        this.ring[(t + P.delay) % RING] = fired;
        this.tick++;
      }
    }

    /** Return spike counts since the last call, then zero them. */
    takeSpikes() {
      const s = this.spikes;
      this.spikes = new Uint32Array(this.n);
      return s;
    }

    get timeMs() {
      return this.tick * P.dt;
    }
  }

  FlyBrain.PARAMS = P;
  window.FlyBrain = FlyBrain;
})();
