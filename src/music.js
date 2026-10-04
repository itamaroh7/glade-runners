// Procedural adaptive soundtrack: a tiny 16th-note sequencer with mood layers.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Chords as MIDI note triads, four bars per loop.
const PROGS = {
  major: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
  minor: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
  dark: [[50, 53, 57], [46, 50, 53], [48, 51, 55], [45, 49, 52]], // Dm Bb Cm A
};

const MOODS = {
  menu: { bpm: 92, prog: 'major', pad: 0.5, arp: 0.45, bass: 0.25, kick: 0, hat: 0.12, arpRate: 2 },
  glade: { bpm: 96, prog: 'major', pad: 0.45, arp: 0.5, bass: 0.35, kick: 0.25, hat: 0.18, arpRate: 2 },
  maze: { bpm: 104, prog: 'minor', pad: 0.35, arp: 0.35, bass: 0.5, kick: 0.35, hat: 0.3, arpRate: 2 },
  chase: { bpm: 132, prog: 'minor', pad: 0.25, arp: 0.55, bass: 0.7, kick: 0.75, hat: 0.5, arpRate: 1 },
  night: { bpm: 88, prog: 'dark', pad: 0.6, arp: 0.25, bass: 0.45, kick: 0.3, hat: 0.1, arpRate: 2 },
  siege: { bpm: 140, prog: 'dark', pad: 0.3, arp: 0.6, bass: 0.75, kick: 0.85, hat: 0.55, arpRate: 1 },
  win: { bpm: 112, prog: 'major', pad: 0.5, arp: 0.6, bass: 0.5, kick: 0.5, hat: 0.35, arpRate: 1 },
  quiet: { bpm: 90, prog: 'minor', pad: 0.2, arp: 0, bass: 0, kick: 0, hat: 0, arpRate: 2 },
};

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.mood = 'menu';
    this.enabled = true;
    this.started = false;
  }

  start() {
    const ctx = this.sfx.ctx;
    if (!ctx || this.started) return;
    this.started = true;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? 0.3 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.out.connect(comp).connect(ctx.destination);
    this.layers = {};
    for (const k of ['pad', 'arp', 'bass', 'kick', 'hat']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      this.layers[k] = g;
    }
    const padF = ctx.createBiquadFilter();
    padF.type = 'lowpass';
    padF.frequency.value = 1100;
    padF.connect(this.layers.pad);
    this.padIn = padF;
    this.step = 0;
    this.next = ctx.currentTime + 0.1;
    this.cur = MOODS[this.mood];
    this.applyMood(0.5);
    this.timer = setInterval(() => this.tick(), 30);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.out) this.out.gain.setTargetAtTime(on ? 0.3 : 0, this.ctx.currentTime, 0.2);
  }

  setMood(m) {
    if (m === this.mood) return;
    this.mood = m;
    if (this.started) this.applyMood(1.2);
  }

  applyMood(fade) {
    const M = MOODS[this.mood];
    const t = this.ctx.currentTime;
    for (const k of Object.keys(this.layers)) this.layers[k].gain.setTargetAtTime(M[k], t, fade / 3);
    this.pending = M; // tempo/progression switch on the next bar
  }

  tick() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    while (this.next < ctx.currentTime + 0.15) {
      if (this.step % 16 === 0 && this.pending) { this.cur = this.pending; this.pending = null; }
      this.schedule(this.step, this.next);
      this.next += 60 / this.cur.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  schedule(s, t) {
    const M = this.cur;
    const bar = s >> 4, i = s & 15;
    const chord = PROGS[M.prog][bar];
    const barLen = (60 / M.bpm) * 4;
    if (i === 0 && M.pad > 0) for (const n of chord) this.pad(mtof(n), t, barLen);
    if ([0, 3, 6, 8, 11, 14].includes(i) && M.bass > 0) this.bass(mtof(chord[0] - 24 + (i === 6 || i === 14 ? 12 : 0)), t);
    if (i % M.arpRate === 0 && M.arp > 0) {
      const seq = [0, 1, 2, 1, 2, 0, 1, 2];
      const n = chord[seq[(s / M.arpRate) % seq.length | 0]] + 12 + (i >= 8 && M.arpRate === 1 ? 12 : 0);
      this.pluck(mtof(n), t);
    }
    if (M.kick > 0 && (i === 0 || i === 8 || (M.arpRate === 1 && (i === 4 || i === 12) && M.kick > 0.6))) this.kick(t);
    if (M.kick > 0.6 && (i === 4 || i === 12)) this.snare(t);
    if (M.hat > 0 && i % 2 === 0) this.hat(t, i % 4 === 2 ? 1 : 0.5);
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  pad(f, t, dur) {
    const ctx = this.ctx;
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
      o.connect(g).connect(this.padIn);
      o.start(t);
      o.stop(t + dur * 1.1);
    }
  }

  pluck(f, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.18, 0.28);
    o.connect(g).connect(this.layers.arp);
    o.start(t);
    o.stop(t + 0.3);
  }

  bass(f, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(900, t);
    fl.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.3, 0.24);
    o.connect(fl).connect(g).connect(this.layers.bass);
    o.start(t);
    o.stop(t + 0.26);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.7, 0.2);
    o.connect(g).connect(this.layers.kick);
    o.start(t);
    o.stop(t + 0.22);
  }

  noiseHit(t, dest, type, freq, peak, dur) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sfx.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, 0.002, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  snare(t) { this.noiseHit(t, this.layers.kick, 'bandpass', 1800, 0.35, 0.14); }
  hat(t, v) { this.noiseHit(t, this.layers.hat, 'highpass', 7000, 0.12 * v, 0.05); }
}
