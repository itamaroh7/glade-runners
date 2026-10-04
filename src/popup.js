import * as THREE from 'three';

const v = new THREE.Vector3();
const RES_ICON = { food: '🍎', wood: '🪵', metal: '⚙️' };

/** A speech-bubble panel anchored to a spot in the world. */
export class Popup {
  constructor(el, sfx) {
    this.el = el;
    this.sfx = sfx;
    this.anchor = null;
    this.buttons = [];
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b && !b.disabled) { this.sfx.click(); this.buttons[Number(b.dataset.i)]?.onClick?.(); }
      else if (e.target.closest('.pp-x')) { this.sfx.click(); this.hide(); }
    });
  }

  get open() { return !!this.anchor; }

  /**
   * spec: { x, z, y, icon, title, level, desc, progress, info, buttons: [{ label, cost, disabled, cls, onClick }], key }
   */
  show(spec) {
    this.spec = spec;
    this.anchor = { x: spec.x, z: spec.z, y: spec.y ?? 3 };
    this.buttons = spec.buttons ?? [];
    const cost = (c, res) => c ? Object.entries(c).map(([k, n]) => `<span class="pc ${res && res[k] < n ? 'short' : ''}">${RES_ICON[k]}${n}</span>`).join('') : '';
    this.el.innerHTML = `
      <button class="pp-x" aria-label="close">×</button>
      <div class="pp-head"><span class="pp-icon">${spec.icon ?? ''}</span><b class="ink">${spec.title ?? ''}</b>${spec.level ? `<span class="pp-lv">${spec.level}</span>` : ''}</div>
      ${spec.desc ? `<div class="pp-desc">${spec.desc}</div>` : ''}
      ${spec.info ? `<div class="pp-info">${spec.info}</div>` : ''}
      ${spec.progress !== undefined ? `<div class="pp-prog"><i style="transform:scaleX(${spec.progress})"></i></div>` : ''}
      ${this.buttons.length ? `<div class="pp-btns">${this.buttons.map((b, i) => `<button class="btn small ${b.cls ?? ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}${b.cost ? `<span class="pcost">${cost(b.cost, b.res)}</span>` : ''}</button>`).join('')}</div>` : ''}`;
    this.el.classList.remove('hidden');
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }

  /** Live-update the progress bar without rebuilding. */
  setProgress(p) {
    const bar = this.el.querySelector('.pp-prog i');
    if (bar) bar.style.transform = `scaleX(${p})`;
  }

  hide() {
    this.anchor = null;
    this.spec = null;
    this.el.classList.add('hidden');
  }

  update(camera) {
    if (!this.anchor) return;
    v.set(this.anchor.x, this.anchor.y, this.anchor.z).project(camera);
    const W = window.innerWidth, H = window.innerHeight;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let x = (v.x + 1) / 2 * W - w / 2;
    let y = (1 - v.y) / 2 * H - h - 10;
    x = Math.max(8, Math.min(W - w - 8, x));
    y = Math.max(60, Math.min(H - h - 8, y));
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}
