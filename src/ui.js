import * as THREE from 'three';
import { PARTS, PAINTS, SLOTS, part, stats } from './data/parts.js';
import { buildSub } from './subModel.js';
import { SEGS } from './save.js';
import { TAU } from './util.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- HUD
export class HUD {
  constructor() {
    this.el = $('hud');
    this.toastKeys = new Map();
    this.arrows = $('arrows');
    this.actx = this.arrows.getContext('2d');
  }
  show(v) { this.el.classList.toggle('hidden', !v); this.arrows.style.display = v ? '' : 'none'; }
  update(g) {
    const s = g.sub;
    $('hullBar').style.width = `${(100 * Math.max(0, s.hull)) / s.st.hp}%`;
    $('fuelBar').style.width = `${(100 * s.fuel) / s.st.fuel}%`;
    $('pearls').textContent = g.save.pearls;
    $('beacons').textContent = Object.keys(g.save.lit).length;
    $('lampChip').classList.toggle('off', !s.lampOn);
    const e = s.env;
    if (e) {
      $('worldName').textContent = e.space ? 'Open sky' : e.w.name;
      let d;
      if (e.space) d = `${Math.round(e.r - e.w.R)} above ${e.w.name}`;
      else if (e.subm > 0.5) d = `Depth ${Math.max(0, Math.round(e.below))} / ${s.st.depth}`;
      else d = `Altitude ${Math.max(0, Math.round(e.r - e.surf))}`;
      $('depth').textContent = `${d} · ${s.speed.toFixed(0)} kn`;
    }
    const warn = $('warn');
    if (s.overDepth > 0) { warn.textContent = `Hull groaning! Too deep for the ${part('hull', g.save.equip.hull).name}.`; warn.classList.remove('hidden'); }
    else warn.classList.add('hidden');
    $('vignette').style.opacity = Math.min(1, (g.hurtFlash || 0) + (s.overDepth > 0 ? 0.5 : 0) + (s.hull / s.st.hp < 0.25 ? 0.35 : 0));
  }
  prompt(text) {
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); return; }
    p.textContent = text;
    p.classList.remove('hidden');
  }
  toast(msg, kind = '', key = null, cooldown = 8) {
    const now = performance.now() / 1000;
    if (key) {
      if ((this.toastKeys.get(key) || 0) > now) return;
      this.toastKeys.set(key, now + cooldown);
    }
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 4200);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  banner(title, sub) {
    const b = $('banner');
    b.querySelector('.b-title').textContent = title;
    b.querySelector('.b-sub').textContent = sub;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 4600);
  }
  /** Edge-of-screen arrows pointing at known worlds that are off-screen. */
  drawArrows(g) {
    const c = this.arrows, dpr = Math.min(devicePixelRatio, 2);
    if (c.width !== innerWidth * dpr) { c.width = innerWidth * dpr; c.height = innerHeight * dpr; }
    const x = this.actx;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, innerWidth, innerHeight);
    const e = g.sub.env;
    if (!e) return;
    const showAll = e.space || e.r > e.w.R + 6;
    if (!showAll) return;
    const v = new THREE.Vector3();
    for (const w of g.worlds) {
      if (!g.save.map[w.id].known || (w === e.w && !e.space)) continue;
      v.set(w.c.x, w.c.y, 0).project(g.camera);
      const W = innerWidth, H = innerHeight;
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const on = sx > 0 && sx < W && sy > 0 && sy < H && v.z < 1;
      const dist = Math.max(0, Math.round(Math.hypot(w.c.x - g.sub.pos.x, w.c.y - g.sub.pos.y) - w.R));
      if (on && dist < 400) continue;
      const cx = W / 2, cy = H / 2;
      let dx = sx - cx, dy = sy - cy;
      if (v.z > 1) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx);
      const m = 46, k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
      x.save();
      x.translate(ax, ay);
      x.rotate(a);
      x.fillStyle = w.def.pal.waterTop;
      x.strokeStyle = '#fff8e7'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(18, 0); x.lineTo(-8, -12); x.lineTo(-3, 0); x.lineTo(-8, 12); x.closePath();
      x.fill(); x.stroke();
      x.restore();
      x.font = '600 14px "Crimson Pro", serif';
      x.textAlign = 'center';
      x.fillStyle = '#fff8e7';
      x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 4;
      const lx = ax - Math.cos(a) * 34, ly = ay - Math.sin(a) * 26;
      x.fillText(`${w.name}${g.save.lit[w.id] ? ' ★' : ''}`, lx, ly);
      x.font = '500 12px "Crimson Pro", serif';
      x.fillText(`${dist}`, lx, ly + 15);
      x.shadowBlur = 0;
    }
  }
}

// ---------------------------------------------------------------- dialog
export class Dialog {
  constructor() { this.el = $('dialog'); this.open = false; }
  start(enc, api, onClose, place) {
    this.enc = enc; this.api = api; this.onClose = onClose;
    $('dlgPortrait').textContent = enc.portrait;
    $('dlgPortrait').style.background = enc.color;
    $('dlgName').textContent = enc.name;
    $('dlgPlace').textContent = place || enc.place;
    this.el.classList.remove('hidden');
    this.open = true;
    this.go(enc.start(api));
  }
  go(key) {
    const node = this.enc.nodes[key](this.api);
    this.node = node;
    $('dlgText').innerHTML = node.text;
    const box = $('dlgChoices');
    box.innerHTML = '';
    this.choices = [];
    node.choices.forEach((ch) => {
      if (ch.cond && !ch.cond(this.api)) return;
      const b = document.createElement('button');
      b.className = 'choice';
      const n = this.choices.length + 1;
      b.innerHTML = `<span class="k">${n}</span>${ch.label}${ch.cost ? `<span class="cost">${ch.cost} pearls</span>` : ''}`;
      if (ch.cost && this.api.pearls() < ch.cost) b.disabled = true;
      b.onclick = () => this.pick(ch);
      box.appendChild(b);
      this.choices.push({ ch, b });
    });
  }
  pick(ch) {
    if (ch.cost) { if (!this.api.spend(ch.cost)) return; }
    this.api.sound.ui();
    if (ch.fx) ch.fx(this.api);
    if (ch.act === 'close' || this.api.closing) { this.close(); return; }
    if (ch.act === 'shop') { this.close(true); this.api.openShop(this.enc); return; }
    if (ch.goto) this.go(ch.goto);
  }
  key(n) { const c = this.choices[n - 1]; if (c && !c.b.disabled) this.pick(c.ch); }
  close(silent) {
    this.el.classList.add('hidden');
    this.open = false;
    if (!silent && this.onClose) this.onClose();
  }
}

// ---------------------------------------------------------------- drydock
export class Shop {
  constructor() {
    this.el = $('shop');
    this.open = false;
    this.tab = 'hull';
    this.canvas = $('preview');
    this.renderer = null;
    $('shopClose').onclick = () => this.close();
  }
  initPreview() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(420, 300, false);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(32, 420 / 300, 0.1, 100);
    this.cam.position.set(0, 2, 13);
    this.cam.lookAt(0, 0.4, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3060a0, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(3, 5, 6);
    this.scene.add(d);
  }
  start(enc, api, onClose) {
    if (!this.renderer) this.initPreview();
    this.enc = enc; this.api = api; this.onClose = onClose;
    this.stock = enc.shop || [];
    $('shopSub').textContent = enc.place;
    this.el.classList.remove('hidden');
    this.open = true;
    this.render();
  }
  close() {
    this.el.classList.add('hidden');
    this.open = false;
    if (this.onClose) this.onClose();
  }
  rebuildModel() {
    if (this.model) this.scene.remove(this.model.root);
    this.model = buildSub(this.api.save.equip);
    this.model.root.scale.setScalar(1.25);
    this.scene.add(this.model.root);
  }
  render() {
    const sv = this.api.save;
    $('shopPearls').textContent = sv.pearls;
    const tabs = $('shopTabs');
    tabs.innerHTML = '';
    for (const [k, label] of SLOTS) {
      const b = document.createElement('button');
      b.className = `tab${k === this.tab ? ' on' : ''}`;
      b.textContent = label;
      b.onclick = () => { this.tab = k; this.api.sound.ui(); this.render(); };
      tabs.appendChild(b);
    }
    const list = $('shopParts');
    list.innerHTML = '';
    if (this.tab === 'paint') {
      const sw = document.createElement('div');
      sw.className = 'swatches';
      for (const [name, hex] of PAINTS) {
        const d = document.createElement('div');
        d.className = `swatch${sv.equip.paint === hex ? ' on' : ''}`;
        d.style.background = hex;
        d.title = name;
        d.onclick = () => { sv.equip.paint = hex; this.api.equipChanged(); this.api.sound.ui(); this.render(); };
        sw.appendChild(d);
      }
      list.appendChild(sw);
      const note = document.createElement('div');
      note.className = 'pdesc';
      note.style.marginTop = '10px';
      note.textContent = 'A fresh coat of paint is always free.';
      list.appendChild(note);
    } else {
      for (const p of PARTS[this.tab]) {
        const owned = sv.owned[this.tab].includes(p.id);
        const inStock = this.stock.includes(p.id);
        if (!owned && !inStock) continue;
        const eq = sv.equip[this.tab] === p.id;
        const row = document.createElement('div');
        row.className = `part${eq ? ' eq' : ''}`;
        row.innerHTML = `<div class="pinfo"><div class="pname">${p.name}</div><div class="pdesc">${p.desc}</div><div class="pstat">${this.statLine(this.tab, p)}</div></div>`;
        const b = document.createElement('button');
        b.className = 'btn';
        if (eq) { b.textContent = 'Fitted'; b.disabled = true; }
        else if (owned) { b.textContent = 'Fit'; b.onclick = () => { sv.equip[this.tab] = p.id; this.api.equipChanged(); this.api.sound.dock(); this.render(); }; }
        else {
          b.textContent = `Buy · ${p.price}`;
          b.disabled = sv.pearls < p.price;
          b.onclick = () => {
            if (!this.api.spend(p.price)) return;
            sv.owned[this.tab].push(p.id);
            sv.equip[this.tab] = p.id;
            this.api.equipChanged();
            this.api.sound.buy();
            this.render();
          };
        }
        row.appendChild(b);
        list.appendChild(row);
      }
      const missing = PARTS[this.tab].filter((p) => !sv.owned[this.tab].includes(p.id) && !this.stock.includes(p.id));
      if (missing.length) {
        const n = document.createElement('div');
        n.className = 'pdesc';
        n.style.opacity = 0.6;
        n.textContent = `${missing.length} more ${this.tab === 'fins' ? 'fin sets' : this.tab + 's'} out there, sold in other ports…`;
        list.appendChild(n);
      }
    }
    const s = stats(sv.equip);
    const rows = [
      ['Top speed', s.topSpeed, 18, s.topSpeed.toFixed(1)],
      ['Hull', s.hp, 120, s.hp],
      ['Depth rating', s.depth, 95, s.depth],
      ['Boost', s.rocketThrust * s.fuel, 65, `${s.fuel}s`],
      ['Turning', s.turn, 5, s.turn.toFixed(1)],
      ['Glide', s.glide, 1, s.glide ? s.glide.toFixed(1) : '—'],
      ['Lamp', s.lampRange, 34, s.lampRange],
    ];
    $('shopStats').innerHTML = rows.map(([n, v, max, t]) => `<span>${n}</span><div class="sbar"><i style="width:${Math.min(100, (100 * v) / max)}%"></i></div><span>${t}</span>`).join('');
    this.rebuildModel();
  }
  statLine(slot, p) {
    switch (slot) {
      case 'hull': return `Hull ${p.hp} · depth ${p.depth} · drag ×${p.drag}`;
      case 'engine': return `Thrust ${p.thrust}`;
      case 'fins': return `Turn ${p.turn} · glide ${p.glide}`;
      case 'rocket': return `Thrust ${p.thrust} · burn ${p.fuel}s`;
      case 'lamp': return `Range ${p.range}${p.sneaky ? ' · anglers ignore it' : ''}`;
      default: return '';
    }
  }
  frame(t) {
    if (!this.open || !this.model) return;
    this.model.root.rotation.y = t * 0.6;
    this.model.root.position.y = Math.sin(t * 1.5) * 0.15;
    for (const p of this.model.props) p.rotation.x += 0.15;
    this.renderer.render(this.scene, this.cam);
  }
}

// ---------------------------------------------------------------- chart
export class Chart {
  constructor() {
    this.el = $('chart');
    this.canvas = $('chartCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.open = false;
    this.zoom = 1; this.pan = { x: 0, y: 0 };
    let drag = null;
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.min(8, Math.max(0.3, this.zoom * Math.exp(-e.deltaY * 0.0015))); this.draw(); }, { passive: false });
    // One finger/mouse pans; two fingers pinch-zoom.
    const pts = new Map();
    let pinch = null;
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    this.canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { drag = null; pinch = { d: spread(), z: this.zoom }; }
      else drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      this.canvas.style.cursor = 'grabbing';
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; drag = null; this.canvas.style.cursor = 'grab'; };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('pointermove', (e) => {
      if (!this.open) return;
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) { this.zoom = Math.min(8, Math.max(0.3, (pinch.z * spread()) / pinch.d)); this.draw(); return; }
      if (!drag) return;
      this.pan.x = drag.px + (e.clientX - drag.x); this.pan.y = drag.py + (e.clientY - drag.y); this.draw();
    });
  }
  start(g) {
    this.g = g;
    this.el.classList.remove('hidden');
    this.open = true;
    this.zoom = 1; this.pan = { x: 0, y: 0 };
    this.draw();
  }
  close() { this.el.classList.add('hidden'); this.open = false; }
  draw() {
    const g = this.g, c = this.canvas, dpr = Math.min(devicePixelRatio, 2);
    const W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    const x = this.ctx;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Paper.
    const bg = x.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#2a2a22'); bg.addColorStop(1, '#0e0f0c');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    // Fit known worlds.
    const known = g.worlds.filter((w) => g.save.map[w.id].known);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const w of known) { minX = Math.min(minX, w.c.x - w.R - 60); maxX = Math.max(maxX, w.c.x + w.R + 60); minY = Math.min(minY, w.c.y - w.R - 60); maxY = Math.max(maxY, w.c.y + w.R + 60); }
    minX = Math.min(minX, g.sub.pos.x - 40); maxX = Math.max(maxX, g.sub.pos.x + 40);
    minY = Math.min(minY, g.sub.pos.y - 40); maxY = Math.max(maxY, g.sub.pos.y + 40);
    const scale = Math.min((W - 120) / (maxX - minX), (H - 140) / (maxY - minY)) * this.zoom;
    const ox = W / 2 + this.pan.x - ((minX + maxX) / 2) * scale, oy = H / 2 + 20 + this.pan.y + ((minY + maxY) / 2) * scale;
    const P = (wx, wy) => [ox + wx * scale, oy - wy * scale];
    // Grid.
    x.strokeStyle = 'rgba(243, 223, 168, 0.07)'; x.lineWidth = 1;
    const step = 100 * scale;
    for (let gx = ox % step; gx < W; gx += step) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
    for (let gy = oy % step; gy < H; gy += step) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
    // Compass rose.
    x.save(); x.translate(W - 80, H - 90); x.strokeStyle = 'rgba(243,223,168,0.5)'; x.fillStyle = 'rgba(243,223,168,0.5)';
    x.beginPath(); x.arc(0, 0, 34, 0, TAU); x.stroke();
    for (let i = 0; i < 4; i++) { x.rotate(Math.PI / 2); x.beginPath(); x.moveTo(0, -40); x.lineTo(6, 0); x.lineTo(-6, 0); x.fill(); }
    x.restore();

    const segA = TAU / SEGS;
    for (const w of known) {
      const m = g.save.map[w.id];
      const [cx, cy] = P(w.c.x, w.c.y);
      const pal = w.def.pal;
      // Undiscovered outline.
      x.setLineDash([4, 6]);
      x.strokeStyle = 'rgba(243, 223, 168, 0.4)'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(cx, cy, w.R * scale, 0, TAU); x.stroke();
      x.setLineDash([]);
      // Atmosphere wash.
      const atm = x.createRadialGradient(cx, cy, w.R * scale, cx, cy, (w.R + w.A + w.F * 0.4) * scale);
      atm.addColorStop(0, pal.sky + '55'); atm.addColorStop(1, pal.sky + '00');
      x.fillStyle = atm; x.beginPath(); x.arc(cx, cy, (w.R + w.A + w.F * 0.4) * scale, 0, TAU); x.fill();
      for (let s = 0; s < SEGS; s++) {
        if (m.seg[s] !== '1') continue;
        const a0 = s * segA, a1 = a0 + segA + 0.002;
        // water wedge
        x.fillStyle = pal.waterTop;
        x.globalAlpha = 0.85;
        x.beginPath(); x.moveTo(cx, cy);
        x.arc(cx, cy, w.R * scale, -a0, -a1, true);
        x.closePath(); x.fill();
        x.globalAlpha = 1;
        // land
        x.fillStyle = pal.rock;
        x.beginPath(); x.moveTo(cx, cy);
        const n = 8;
        for (let k = 0; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n, r = w.ground(a);
          const [px, py] = P(w.c.x + Math.cos(a) * r, w.c.y + Math.sin(a) * r);
          x.lineTo(px, py);
        }
        x.closePath(); x.fill();
        x.strokeStyle = pal.sand; x.lineWidth = 2;
        x.beginPath();
        for (let k = 0; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n, r = w.ground(a);
          const [px, py] = P(w.c.x + Math.cos(a) * r, w.c.y + Math.sin(a) * r);
          k ? x.lineTo(px, py) : x.moveTo(px, py);
        }
        x.stroke();
      }
      // Ice
      for (const [a0, a1] of w.ice) {
        x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(2, 2.5 * scale);
        x.beginPath(); x.arc(cx, cy, w.R * scale, -a0, -a1, true); x.stroke();
      }
      // Core.
      x.fillStyle = pal.core; x.beginPath(); x.arc(cx, cy, Math.max(2, w.R * 0.08 * scale), 0, TAU); x.fill();
      // Markers.
      const seen = (a) => m.seg[Math.floor((((a % TAU) + TAU) % TAU) / segA)] === '1';
      const label = (a, r, txt, col, font = '600 13px "Crimson Pro", serif') => {
        const [px, py] = P(w.c.x + Math.cos(a) * r, w.c.y + Math.sin(a) * r);
        x.font = font; x.fillStyle = col; x.textAlign = 'center';
        x.shadowColor = 'rgba(0,0,0,0.7)'; x.shadowBlur = 4;
        x.fillText(txt, px, py);
        x.shadowBlur = 0;
      };
      for (const p of w.def.ports) if (seen(p.at)) { label(p.at, w.R + 3, '⚓', '#fff8e7', '700 18px "Crimson Pro", serif'); label(p.at, w.R + 3 + 22 / scale, g.portName(p.id), '#f3dfa8'); }
      for (const p of w.def.npcs) if (seen(p.at)) label(p.at, w.ground(p.at) + 4, '●', '#ffb0e0', '700 12px "Crimson Pro", serif');
      if (w.def.beacon && (seen(w.def.beacon.at) || g.save.lit[w.id])) label(w.def.beacon.at, w.ground(w.def.beacon.at) + 6, g.save.lit[w.id] ? '★' : '☆', g.save.lit[w.id] ? '#ffe27a' : '#c8c8d8', '700 20px "Crimson Pro", serif');
      if (w.def.storm && g.storm && g.storm.active) {
        x.strokeStyle = 'rgba(160, 120, 255, 0.6)'; x.lineWidth = 6 * Math.max(0.5, scale); x.setLineDash([10, 8]);
        x.beginPath(); x.arc(cx, cy, (w.influence - 15) * scale, 0, TAU); x.stroke(); x.setLineDash([]);
      }
      // Name.
      x.font = `700 ${Math.max(16, Math.min(30, 22 * scale * 2))}px "IM Fell English", serif`;
      x.fillStyle = '#f3dfa8'; x.textAlign = 'center';
      x.fillText(`${w.name}${g.save.lit[w.id] ? ' ★' : ''}`, cx, cy - (w.R + w.A + 10) * scale);
      const pct = Math.round((100 * m.seg.split('').filter((q) => q === '1').length) / SEGS);
      x.font = '500 12px "Crimson Pro", serif'; x.fillStyle = 'rgba(243,223,168,0.7)';
      x.fillText(`${pct}% charted`, cx, cy - (w.R + w.A + 10) * scale + 16);
    }
    // The sub.
    const [sx, sy] = P(g.sub.pos.x, g.sub.pos.y);
    x.save(); x.translate(sx, sy); x.rotate(-g.sub.angle);
    x.fillStyle = g.save.equip.paint; x.strokeStyle = '#15122e'; x.lineWidth = 2;
    x.beginPath(); x.ellipse(0, 0, 10, 6, 0, 0, TAU); x.fill(); x.stroke();
    x.restore();
    x.font = '600 12px "Crimson Pro", serif'; x.fillStyle = '#fff8e7'; x.textAlign = 'center';
    x.fillText('you', sx, sy - 12);
    // Legend.
    x.textAlign = 'left'; x.font = '500 13px "Crimson Pro", serif'; x.fillStyle = 'rgba(243,223,168,0.75)';
    const lit = Object.keys(g.save.lit).length;
    x.fillText(`★ beacons lit: ${lit} / 5    ⚓ ports    ● curious folk`, 18, H - 20);
  }
}
