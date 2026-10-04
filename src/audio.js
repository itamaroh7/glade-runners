// Tiny synthesized sound effects — no audio files needed.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get ok() { return this.ctx && !this.muted; }

  noise(dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.5, attack = 0.005 } = {}) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', f1 = freq, gain = 0.3, delay = 0, attack = 0.005 } = {}) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  throw() { this.noise(0.18, { f0: 600, f1: 2600, q: 2, gain: 0.35 }); }
  wall() { this.noise(0.12, { type: 'lowpass', f0: 2500, f1: 300, gain: 0.4 }); this.tone(320, 0.08, { type: 'square', f1: 120, gain: 0.08 }); }
  crateHit() { this.tone(180, 0.12, { type: 'triangle', f1: 90, gain: 0.35 }); this.noise(0.08, { type: 'lowpass', f0: 1800, f1: 400, gain: 0.3 }); }
  crateBreak() {
    this.noise(0.35, { type: 'lowpass', f0: 3000, f1: 200, gain: 0.5 });
    this.tone(140, 0.25, { type: 'triangle', f1: 60, gain: 0.35 });
  }
  pickup(i = 0) {
    const base = 660 * Math.pow(1.06, Math.min(i, 12));
    this.tone(base, 0.09, { type: 'square', gain: 0.07 });
    this.tone(base * 1.5, 0.12, { type: 'square', gain: 0.07, delay: 0.05 });
  }
  door() {
    this.noise(3.2, { type: 'lowpass', f0: 220, f1: 90, gain: 0.55, attack: 0.4 });
    this.tone(48, 3.2, { type: 'sawtooth', f1: 38, gain: 0.12, attack: 0.5 });
  }
  boom() { this.noise(1.2, { type: 'lowpass', f0: 400, f1: 40, gain: 0.8 }); this.tone(60, 0.9, { f1: 30, gain: 0.5 }); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.18, delay: i * 0.09 })); }
  alarm() { [0, 0.3].forEach((d) => this.tone(880, 0.22, { type: 'square', f1: 660, gain: 0.08, delay: d })); }
  click() { this.tone(900, 0.05, { type: 'square', gain: 0.06 }); }
  roar() {
    this.tone(110, 0.7, { type: 'sawtooth', f1: 55, gain: 0.16, attack: 0.05 });
    this.tone(165, 0.6, { type: 'square', f1: 70, gain: 0.06, attack: 0.05 });
    this.noise(0.7, { type: 'bandpass', f0: 500, f1: 180, q: 3, gain: 0.3, attack: 0.05 });
  }
  windup() { this.tone(200, 0.45, { type: 'sawtooth', f1: 420, gain: 0.08 }); }
  lunge() { this.noise(0.25, { f0: 300, f1: 1400, q: 1.5, gain: 0.35 }); }
  grinderHit() { this.tone(240, 0.1, { type: 'square', f1: 130, gain: 0.09 }); this.noise(0.1, { type: 'highpass', f0: 2000, f1: 4000, gain: 0.18 }); }
  grinderDie() {
    this.noise(0.8, { type: 'lowpass', f0: 2500, f1: 120, gain: 0.6 });
    this.tone(300, 0.6, { type: 'sawtooth', f1: 40, gain: 0.18 });
    [0, 0.08, 0.16].forEach((d) => this.tone(1200 - d * 3000, 0.07, { type: 'square', gain: 0.05, delay: d }));
  }
  hurt() { this.tone(330, 0.18, { type: 'square', f1: 160, gain: 0.12 }); this.noise(0.12, { type: 'lowpass', f0: 1500, f1: 300, gain: 0.3 }); }
  slash() { this.noise(0.16, { f0: 1500, f1: 4500, q: 1.2, gain: 0.35 }); }
  spotted() { [0, 0.12, 0.24].forEach((d) => this.tone(1320, 0.08, { type: 'square', gain: 0.07, delay: d })); }
  superReady() { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', gain: 0.12, delay: i * 0.06 })); }
  superUse() { this.tone(220, 0.4, { type: 'sawtooth', f1: 880, gain: 0.12 }); this.noise(0.35, { f0: 400, f1: 3000, q: 1, gain: 0.3 }); }
  heal() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'sine', gain: 0.12, delay: i * 0.05 })); }
  fragment() { [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.14, delay: i * 0.08 })); }
  grab() { this.tone(500, 0.5, { type: 'sawtooth', f1: 90, gain: 0.15 }); }
  sad() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', gain: 0.16, delay: i * 0.22 })); }
}
