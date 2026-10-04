import * as THREE from 'three';

const v = new THREE.Vector3();

/** Screen-space overlays: damage numbers, enemy health bars, off-screen arrows. */
export class Fx {
  constructor(layer) {
    this.layer = layer;
    this.nums = [];
    this.bars = new Map();
    this.arrows = new Map();
  }

  project(x, y, z, camera) {
    v.set(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, behind: v.z > 1 };
  }

  number(x, y, z, value, cls = '') {
    const el = document.createElement('div');
    el.className = 'dmg ink ' + cls;
    el.textContent = value;
    this.layer.appendChild(el);
    this.nums.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z, t: 0 });
  }

  arrow(key, target, icon = '▲', color = '#ffd23f') {
    let a = this.arrows.get(key);
    if (!target) { if (a) a.el.style.display = 'none'; if (a) a.target = null; return; }
    if (!a) {
      const el = document.createElement('div');
      el.className = 'arrow';
      el.innerHTML = `<div class="tip"></div><div class="ico">${icon}</div>`;
      this.layer.appendChild(el);
      a = { el };
      this.arrows.set(key, a);
    }
    a.el.style.setProperty('--c', color);
    a.target = target;
  }

  clearBars() { for (const b of this.bars.values()) b.el.remove(); this.bars.clear(); }

  update(dt, camera, enemies) {
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      if (n.t > 0.8) { n.el.remove(); this.nums.splice(i, 1); continue; }
      const s = this.project(n.x, n.y + n.t * 1.6, n.z, camera);
      const sc = n.t < 0.1 ? 0.6 + n.t * 6 : 1.2 - (n.t - 0.1) * 0.4;
      n.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${sc})`;
      n.el.style.opacity = n.t > 0.55 ? (0.8 - n.t) * 4 : 1;
    }

    const seen = new Set();
    for (const e of enemies) {
      if (!e.alive || e.kind !== 'grinder') continue;
      if (e.hp >= e.maxHp && e.state === 'patrol') continue;
      seen.add(e);
      let b = this.bars.get(e);
      if (!b) {
        const el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = '<div class="fill"></div>';
        this.layer.appendChild(el);
        b = { el, fill: el.firstChild };
        this.bars.set(e, b);
      }
      const s = this.project(e.pos.x, 3.1, e.pos.z, camera);
      b.el.style.transform = `translate(${s.x - 32}px, ${s.y}px)`;
      b.fill.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp)})`;
    }
    for (const [e, b] of this.bars) if (!seen.has(e)) { b.el.remove(); this.bars.delete(e); }

    const W = window.innerWidth, H = window.innerHeight, m = 46;
    for (const a of this.arrows.values()) {
      if (!a.target) continue;
      const s = this.project(a.target.x, 1, a.target.z, camera);
      let dx = s.x - W / 2, dy = s.y - H / 2;
      if (s.behind) { dx = -dx; dy = -dy; }
      const onScreen = !s.behind && s.x > m && s.x < W - m && s.y > m && s.y < H - m;
      if (onScreen) { a.el.style.display = 'none'; continue; }
      a.el.style.display = '';
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
      const x = W / 2 + dx * k, y = H / 2 + dy * k;
      const ang = Math.atan2(dy, dx);
      a.el.style.transform = `translate(${x}px, ${y}px)`;
      a.el.firstChild.style.transform = `rotate(${ang}rad)`;
    }
  }

  clear() {
    for (const n of this.nums) n.el.remove();
    this.nums.length = 0;
    this.clearBars();
    for (const a of this.arrows.values()) a.el.remove();
    this.arrows.clear();
  }
}
