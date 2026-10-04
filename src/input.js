// Twin-stick touch controls (Brawl-style) plus keyboard & mouse.
// Screen up = world -Z, screen right = world +X, so stick vectors map straight to (x, z).
const RADIUS = 58;
const DEAD = 0.22;

export class Input {
  constructor(hud) {
    this.move = { x: 0, z: 0 };
    this.aim = { x: 0, z: 0, active: false };
    this.fire = null; // { auto: bool, x, z }
    this.keys = new Set();
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.mouse = { x: 0, y: 0, inside: false, down: false };
    this.enabled = false;
    this.onKey = null;

    this.mv = { el: hud.querySelector('#stick-move'), id: null, bx: 0, by: 0, x: 0, y: 0 };
    this.at = { el: hud.querySelector('#stick-attack'), id: null, bx: 0, by: 0, x: 0, y: 0, moved: false };
    for (const s of [this.mv, this.at]) s.knob = s.el.querySelector('.knob');
    this.applyMode();

    const opts = { passive: false };
    window.addEventListener('pointerdown', (e) => this.down(e), opts);
    window.addEventListener('pointermove', (e) => this.moveEv(e), opts);
    window.addEventListener('pointerup', (e) => this.up(e), opts);
    window.addEventListener('pointercancel', (e) => this.up(e, true), opts);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.enabled && (e.code === 'Space' || e.code === 'KeyE')) { this.superQ = true; e.preventDefault(); }
      this.onKey?.(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.reset(); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    this.applyMode();
  }
  applyMode() { document.body.classList.toggle('touch', this.mode === 'touch'); }

  attackCenter() {
    const r = this.at.el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  down(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setMode('touch');
    if (!this.enabled) return;
    if (e.target.closest?.('button, .ui-block')) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) { this.mouse.down = true; this.fire = { auto: false, mouse: true }; this.tap = { x: e.clientX, y: e.clientY, mouse: true }; }
      else if (e.button === 2) this.superQ = true;
      return;
    }
    e.preventDefault();
    const w = window.innerWidth;
    if (e.clientX < w * 0.5) {
      if (this.mv.id !== null) return;
      const s = this.mv;
      s.id = e.pointerId;
      s.t0 = performance.now(); s.sx = e.clientX; s.sy = e.clientY;
      s.bx = Math.max(RADIUS + 16, e.clientX);
      s.by = Math.min(window.innerHeight - RADIUS - 16, Math.max(RADIUS + 16, e.clientY));
      s.x = e.clientX; s.y = e.clientY;
      s.el.classList.add('active');
      s.el.style.left = s.bx + 'px';
      s.el.style.top = s.by + 'px';
      this.updateStick(s);
    } else {
      if (this.at.id !== null) return;
      const s = this.at;
      s.id = e.pointerId;
      const c = this.attackCenter();
      const near = Math.hypot(e.clientX - c.x, e.clientY - c.y) < RADIUS * 2;
      s.bx = near ? c.x : e.clientX;
      s.by = near ? c.y : e.clientY;
      s.x = e.clientX; s.y = e.clientY;
      s.t0 = performance.now(); s.sx = e.clientX; s.sy = e.clientY; s.near = near;
      s.moved = false;
      s.el.classList.add('active');
      this.updateStick(s);
    }
  }

  moveEv(e) {
    if (e.pointerType === 'mouse') {
      this.setMode('mouse');
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
      return;
    }
    for (const s of [this.mv, this.at]) {
      if (s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; this.updateStick(s); }
    }
  }

  up(e, cancel = false) {
    if (e.pointerType === 'mouse') { this.mouse.down = false; return; }
    const short = (s) => performance.now() - s.t0 < 320 && Math.hypot(s.x - s.sx, s.y - s.sy) < 16;
    if (this.mv.id === e.pointerId) {
      if (!cancel && this.enabled && short(this.mv)) this.tap = { x: this.mv.sx, y: this.mv.sy };
      this.mv.id = null;
      this.mv.el.classList.remove('active');
      this.mv.el.style.left = this.mv.el.style.top = '';
      this.mv.knob.style.transform = '';
      this.move.x = this.move.z = 0;
    }
    if (this.at.id === e.pointerId) {
      const s = this.at;
      s.id = null;
      s.el.classList.remove('active');
      s.knob.style.transform = '';
      if (!cancel && this.enabled) {
        if (this.aim.active) this.fire = { auto: false, x: this.aim.x, z: this.aim.z };
        else if (!s.near && short(s)) this.tap = { x: s.sx, y: s.sy, fallbackFire: true };
        else this.fire = { auto: true };
      }
      this.aim.active = false;
    }
  }

  updateStick(s) {
    let dx = s.x - s.bx, dy = s.y - s.by;
    const len = Math.hypot(dx, dy);
    const k = len > RADIUS ? RADIUS / len : 1;
    dx *= k; dy *= k;
    s.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / RADIUS, ny = dy / RADIUS;
    const m = Math.hypot(nx, ny);
    if (s === this.mv) {
      if (m < 0.12) { this.move.x = this.move.z = 0; return; }
      this.move.x = nx; this.move.z = ny;
    } else {
      if (m > DEAD) { this.aim.active = true; this.aim.x = nx / m; this.aim.z = ny / m; }
      else this.aim.active = false;
    }
  }

  reset() {
    this.move.x = this.move.z = 0;
    this.aim.active = false;
    this.fire = null;
    this.superQ = false;
    this.tap = null;
    this.mouse.down = false;
    for (const s of [this.mv, this.at]) {
      s.id = null;
      s.el.classList.remove('active');
      s.el.style.left = s.el.style.top = '';
      s.knob.style.transform = '';
    }
  }

  /** Keyboard movement merged with stick. */
  readMove() {
    let x = 0, z = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (x || z) { const l = Math.hypot(x, z); return { x: x / l, z: z / l }; }
    return this.move;
  }

  takeFire() { const f = this.fire; this.fire = null; return f; }
  takeSuper() { const s = this.superQ; this.superQ = false; return s; }
  takeTap() { const t = this.tap; this.tap = null; return t; }
}
