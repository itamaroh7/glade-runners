import { t, tn, getLang } from './i18n.js';
import { ROLES, ROLE_ORDER, BUILDINGS, BUILD_ORDER, RUNNERS, RUNNER_ORDER, CODE_WORDS } from './data.js';
import { forecast, beds, fieldSlots, roleCount, setRole, buildCost, canAfford, build, gladerName, isFinalDay, FRAGMENTS_NEEDED } from './colony.js';

const $ = (s) => document.querySelector(s);
const RES_ICON = { food: '🍎', wood: '🪵', metal: '⚙️' };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

/**
 * Morning planning & evening report panel.
 * api: { save(), persist(), onOpenDoors(), onContinue(), onRunnerChanged(), onBuilt(key), sfx }
 */
export class Council {
  constructor(api) {
    this.api = api;
    this.tab = 'gladers';
    this.el = $('#screen-council');
    this.body = $('#c-body');
    this.el.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { api.sfx.click(); this.tab = b.dataset.tab; this.render(); }));
    $('#c-go').addEventListener('click', () => {
      api.sfx.click();
      if (this.mode === 'evening') api.onContinue();
      else api.onOpenDoors();
    });
    this.body.addEventListener('click', (e) => this.onClick(e));
  }

  open(mode, report = []) {
    this.mode = mode;
    this.report = report;
    if (mode === 'morning') this.tab = this.tab ?? 'gladers';
    this.render();
  }

  render() {
    const s = this.api.save();
    const morning = this.mode === 'morning';
    $('#c-title').textContent = morning ? (isFinalDay(s) ? t('finalMorning') + ' · ' + t('day', { n: s.day }) : t('morning', { n: s.day })) : t('evening', { n: s.day - 1 });
    $('#c-res').innerHTML = ['food', 'wood', 'metal'].map((k) => `<span class="chip"><i>${RES_ICON[k]}</i><b class="ink">${s.res[k]}</b></span>`).join('')
      + `<span class="chip"><i>👥</i><b class="ink">${s.gladers.length}/${beds(s)}</b></span>`;
    this.el.querySelector('.tabs').classList.toggle('hidden', !morning);
    this.el.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    $('#c-go').textContent = morning ? t('openDoors') : t('cont');
    $('#c-go').classList.toggle('pulse', morning);
    $('#c-code').innerHTML = `<span class="lbl">${t('code')}</span>` + CODE_WORDS.map((w, i) => `<span class="slot ${i < s.fragments ? 'got' : ''}">${i < s.fragments ? w[getLang() === 'he' ? 1 : 0] : '?'}</span>`).join('');
    if (!morning) this.body.innerHTML = this.renderReport();
    else if (this.tab === 'gladers') this.body.innerHTML = this.renderGladers(s);
    else if (this.tab === 'build') this.body.innerHTML = this.renderBuild(s);
    else this.body.innerHTML = this.renderRunners(s);
    this.body.scrollTop = 0;
  }

  renderReport() {
    const lang = getLang();
    return '<div class="report">' + this.report.map((l) => {
      const vars = { ...(l.vars ?? {}) };
      if (vars.glader) vars.name = gladerName(vars.glader, lang);
      if (vars.runner) vars.name = tn(RUNNERS[vars.runner].name);
      if (vars.gname) vars.name = vars.gname;
      return `<div class="rline ${l.tone}"><span class="ri">${l.icon}</span><span>${t(l.key, vars)}</span></div>`;
    }).join('') + '</div>';
  }

  renderGladers(s) {
    const f = forecast(s);
    const idle = roleCount(s, 'idle');
    let h = `<div class="cinfo"><span>${t('tomorrow', { p: f.food, e: f.eat })}</span>`;
    if (s.hungry) h += `<span class="warn">⚠️ ${t('hungryNow')}</span>`;
    else if (s.res.food + f.food < f.eat) h += `<span class="warn">⚠️ ${t('foodWarn')}</span>`;
    h += '</div><div class="roles">';
    for (const r of ROLE_ORDER) {
      const n = roleCount(s, r);
      const locked = ROLES[r].needs && s.buildings[ROLES[r].needs] < 1;
      let extra = '';
      if (r === 'farmer') extra = ` <em>(${Math.min(n, fieldSlots(s))}/${fieldSlots(s)})</em>`;
      const names = s.gladers.filter((g) => g.role === r).map((g) => gladerName(g, getLang())).join(', ');
      h += `<div class="role ${locked ? 'locked' : ''}">
        <div class="ricon">${ROLES[r].icon}</div>
        <div class="rtext"><b>${t(r)}${extra}</b><small>${t(r + 'D')}</small><small class="names">${names}</small></div>
        <div class="rctl">
          <button class="mini" data-act="role" data-role="${r}" data-d="-1" ${n ? '' : 'disabled'}>−</button>
          <span class="ink">${n}</span>
          <button class="mini" data-act="role" data-role="${r}" data-d="1" ${idle && !locked ? '' : 'disabled'}>+</button>
        </div></div>`;
    }
    h += `</div><div class="cinfo"><span>${t('idle')}: <b>${idle}</b> · ${t('bedsLbl', { a: s.gladers.length, b: beds(s) })}</span></div>`;
    return h;
  }

  renderBuild(s) {
    let h = '<div class="cards">';
    for (const k of BUILD_ORDER) {
      const lvl = s.buildings[k];
      const max = BUILDINGS[k].max;
      const cost = buildCost(s, k);
      const effect = (L) => {
        if (k === 'fields') return t('fieldsE', { n: L * 2 });
        if (k === 'homestead') return t('homesteadE', { n: [0, 8, 12, 16][L] });
        return t(k + L);
      };
      const now = lvl > 0 ? effect(lvl) : '—';
      const next = lvl < max ? effect(lvl + 1) : '';
      const afford = canAfford(s, cost);
      h += `<div class="card2">
        <div class="bhead"><span class="bicon">${BUILDINGS[k].icon}</span><b>${t(k)}</b><span class="lv">${t('lvl', { n: lvl })}</span></div>
        <small class="now">${now}</small>
        ${next ? `<small class="next">▶ ${next}</small>` : ''}
        <div class="bfoot">
          ${cost ? Object.entries(cost).map(([r, v]) => `<span class="cost ${s.res[r] >= v ? '' : 'short'}">${RES_ICON[r]} ${v}</span>`).join('') : ''}
          ${lvl >= max ? `<span class="maxed">${t('maxed')}</span>` : `<button class="btn small ${afford ? '' : 'grey'}" data-act="build" data-k="${k}" ${afford ? '' : 'disabled'}>${t('buildBtn')}</button>`}
        </div></div>`;
    }
    return h + '</div>';
  }

  renderRunners(s) {
    let h = '<div class="cards runners">';
    for (const id of RUNNER_ORDER) {
      const R = RUNNERS[id];
      const un = s.unlocked.includes(id);
      const sel = s.runner === id;
      let lock = '';
      if (!un) {
        const u = R.unlock;
        lock = u.day ? t('unlockDay', { n: u.day }) : u.kills ? t('unlockKills') : t('unlockFrag', { n: u.fragments });
      }
      const bar = (v) => `<span class="sbar"><i style="width:${Math.round(v * 100)}%"></i></span>`;
      h += `<div class="card2 runner ${sel ? 'sel' : ''} ${un ? '' : 'locked'}" ${un ? `data-act="runner" data-id="${id}"` : ''}>
        <div class="bhead"><span class="face" style="--skin:${hex(R.look.skin)};--hair:${hex(R.look.hair)};--shirt:${hex(R.look.shirt)}"></span><b>${tn(R.name)}</b><span class="lv">${t(id + 'R')}</span></div>
        <div class="stats"><small>${t('hp')}</small>${bar(R.hp / 5000)}<small>${t('atk')}</small><small class="val">${t(id + 'A')}</small></div>
        <small class="next">⚡ ${t(id + 'S')}</small>
        <div class="bfoot">${un ? (sel ? `<span class="maxed">${t('selected')}</span>` : `<button class="btn small blue" data-act="runner" data-id="${id}">${t('choose')}</button>`) : `<span class="maxed">🔒 ${lock}</span>`}</div>
      </div>`;
    }
    return h + '</div>';
  }

  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const s = this.api.save();
    const act = b.dataset.act;
    if (act === 'role') {
      if (setRole(s, b.dataset.role, Number(b.dataset.d))) { this.api.sfx.click(); this.api.persist(); this.api.onRolesChanged?.(); }
    } else if (act === 'build') {
      if (build(s, b.dataset.k)) { this.api.sfx.fanfare(); this.api.persist(); this.api.onBuilt(b.dataset.k); }
    } else if (act === 'runner') {
      if (s.runner !== b.dataset.id) { s.runner = b.dataset.id; this.api.sfx.click(); this.api.persist(); this.api.onRunnerChanged(); }
    }
    this.render();
  }
}
