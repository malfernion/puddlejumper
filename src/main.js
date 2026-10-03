import * as THREE from 'three';
import { WORLDS } from './data/worlds.js';
import { ENCOUNTERS } from './data/encounters.js';
import { part } from './data/parts.js';
import { World, smoothLight } from './world.js';
import { Sub } from './sub.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { Whale, Jelly, Eel, Angler, Kraken, School } from './creatures.js';
import { buildPort, buildNpcHome, Beacon, Pickup, Geyser, Storm } from './structures.js';
import { HUD, Dialog, Shop, Chart } from './ui.js';
import { newSave, loadSave, writeSave, clearSave, SEGS } from './save.js';
import { TAU, clamp, damp, dampAngle, lerp, wrapAngle, smoothstep, rand } from './util.js';
import { glowSprite } from './toon.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const SPACE_BG = new THREE.Color('#0b1030');

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    $('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd8ff');
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 8000);
    this.camBasis = { rx: 1, ry: 0, ux: 0, uy: 1 };
    this.camUp = Math.PI / 2;
    this.camDist = 40;
    this.shake = 0;
    this.hurtFlash = 0;
    this.god = false;

    this.hemi = new THREE.HemisphereLight(0xe8f8ff, 0x34407a, 1.8);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.buildSky();

    this.save = loadSave();
    this.fx = new FX(this.scene);
    this.sound = new Sound();
    this.hud = new HUD();
    this.dialog = new Dialog();
    this.shop = new Shop();
    this.chart = new Chart();

    this.worlds = WORLDS.map((d) => new World(d));
    for (const w of this.worlds) this.scene.add(w.group);
    this.sub = new Sub(this.scene);
    this.populate(this.save || newSave());
    this.sub.equip(this.save.equip);

    this.keys = new Set();
    this.edges = new Set();
    this.pad = { prev: [] };
    this.bindInput();
    this.bindMenus();
    this.state = 'title';
    this.titleT = 0;
    this.saveT = 0;
    this.discT = 0;
    this.t = 0;
    this.clock = new THREE.Clock();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    window.game = this;
  }

  // ------------------------------------------------------------------ setup
  buildSky() {
    const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos.set([rand(-5000, 5000), rand(-5000, 5000), rand(-1400, -900)], i * 3);
      c.setHSL(rand(0.5, 0.7), 0.6, rand(0.7, 1));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    const stars = new THREE.Points(g, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -10;
    this.scene.add(stars);
    this.nebulae = [];
    for (const [x, y, colr, s] of [[300, 300, '#6b4ad8', 1600], [-600, 900, '#d84a9a', 1800], [500, -700, '#3a8ad8', 1500], [-900, -200, '#4ad8b0', 1400]]) {
      const sp = glowSprite(colr, s, 0);
      sp.position.set(x, y, -1300);
      sp.material.blending = THREE.AdditiveBlending;
      this.scene.add(sp);
      this.nebulae.push(sp);
    }
  }

  populate(save) {
    this.save = save;
    this.interact = [];
    this.pickups = [];
    this.beaconObjs = {};
    for (const w of this.worlds) {
      const d = w.def;
      for (const p of d.ports) {
        const g = buildPort(w, p);
        w.things.push({ update: (dt) => { g.traverse((o) => { if (o.userData.spin) o.rotation.z = Math.sin(w.t * o.userData.spin) * 1.1; if (o.userData.waddle !== undefined) o.rotation.z = Math.sin(w.t * 6 + o.userData.waddle) * 0.15; }); if (g.userData.steam && Math.random() < 0.2) { const v = g.localToWorld(g.userData.steam.clone()); this.fx.puff(v.x, v.y, 0xffffff, 1, 1.2); } } });
        this.interact.push({ kind: 'port', id: p.id, w, th: p.at, r: w.R - 1, radius: 12, label: `Dock at ${this.portName(p.id)}` });
      }
      for (const n of d.npcs) {
        const g = buildNpcHome(w, n);
        if (g.userData.bob) w.things.push({ update: () => { g.userData.bob.position.y += Math.sin(w.t * 2) * 0.005; } });
        this.interact.push({ kind: 'npc', id: n.id, w, th: n.at, r: w.ground(n.at) + 3, radius: 10, label: `Visit ${ENCOUNTERS[n.id].name}` });
      }
      if (d.beacon) {
        const b = new Beacon(w, d.beacon, !!save.lit[w.id]);
        this.beaconObjs[w.id] = b;
        w.things.push(b);
      }
      for (const c of d.creatures) {
        if (c.type === 'whale') {
          const wh = new Whale(w, c, this);
          w.creatures.push(wh);
          this.interact.push({ kind: 'talk', id: c.id, w, get: () => wh.gp, radius: c.narwhal ? 13 : 18, label: `Hail ${ENCOUNTERS[c.id].name}` });
        } else if (c.type === 'jelly') for (let i = 0; i < c.n; i++) w.creatures.push(new Jelly(w, i, this));
        else if (c.type === 'school') for (let i = 0; i < c.n; i++) w.creatures.push(new School(w, i, this));
        else if (c.type === 'eel') w.creatures.push(new Eel(w, c, this));
        else if (c.type === 'angler') w.creatures.push(new Angler(w, c, this));
        else if (c.type === 'kraken') { this.kraken = new Kraken(w, c, this); w.creatures.push(this.kraken); if (save.won) this.kraken.calm = true; }
      }
      // Pearls and crates.
      const rng = w.rng;
      for (let i = 0; i < d.pearls; i++) {
        let th, g, tries = 0;
        do { th = rng() * TAU; g = w.ground(th); tries++; } while ((g > w.R - 5) && tries < 30);
        const top = w.ice.length && w.inIce(th) ? w.R - 4 : w.R - 2.5;
        const r = g + 2 + rng() * Math.max(0, top - g - 2);
        const id = `${w.id}-p${i}`;
        if (save.taken.includes(id)) continue;
        this.pickups.push(new Pickup(w, id, th, r, 'pearl'));
      }
      d.crates.forEach((c, i) => {
        const id = `${w.id}-c${i}`;
        if (save.taken.includes(id)) return;
        this.pickups.push(new Pickup(w, id, c.at, w.ground(c.at) + 1.2, 'crate'));
      });
      (d.geysers || []).forEach((a, i) => w.things.push(new Geyser(w, a, i)));
      if (d.storm) {
        this.storm = new Storm(w, this.scene);
        this.storm.setActive(this.litCount() < 4);
        w.things.push(this.storm);
      }
    }
  }

  portName(id) { return ENCOUNTERS[id].place.split(',')[0]; }
  litCount() { return Object.keys(this.save.lit).filter((k) => k !== 'maw').length; }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.chart.open) this.chart.draw();
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const map = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'boost', ShiftLeft: 'boost', KeyE: 'act', Enter: 'enter', KeyL: 'lamp', KeyM: 'map', Escape: 'esc', KeyH: 'help', KeyP: 'dbgP', KeyG: 'dbgG', KeyK: 'dbgK' };
    addEventListener('keydown', (e) => {
      this.sound.init();
      if (e.code.startsWith('Digit')) { this.onDigit(+e.code.slice(5)); return; }
      const k = map[e.code];
      if (!k) return;
      if (['up', 'down', 'boost'].includes(k) || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(k)) this.edges.add(k);
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => { const k = map[e.code]; if (k) this.keys.delete(k); });
    addEventListener('blur', () => this.keys.clear());
    addEventListener('pointerdown', () => this.sound.init());
  }
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((x) => x);
    if (!p) return null;
    const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const edge = (i, name) => { if (btn(i) && !this.pad.prev[i]) this.edges.add(name); this.pad.prev[i] = btn(i); };
    edge(2, 'act'); edge(3, 'map'); edge(1, 'lamp'); edge(9, 'esc'); edge(0, 'padA');
    let x = p.axes[0] || 0, y = -(p.axes[1] || 0);
    if (btn(14)) x = -1; if (btn(15)) x = 1; if (btn(12)) y = 1; if (btn(13)) y = -1;
    if (Math.hypot(x, y) < 0.2) { x = 0; y = 0; }
    return { x, y, boost: btn(0) || btn(7) };
  }
  readInput() {
    let x = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    let y = (this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    let boost = this.keys.has('boost');
    if (this.forced) return this.forced;
    const pad = this.pollPad();
    if (pad && (pad.x || pad.y)) { x = pad.x; y = pad.y; }
    if (pad && pad.boost) boost = true;
    return { x, y, boost };
  }
  onDigit(n) {
    if (this.dialog.open) { this.dialog.key(n); return; }
    if (DEBUG && this.state === 'play' && n >= 1 && n <= 5) {
      const w = this.worlds[n - 1];
      this.sub.pos.copy(w.globalXY(Math.PI / 2, w.R - 6));
      this.sub.vel.set(0, 0);
      w.def.id && (this.save.map[w.id].known = true);
    }
  }

  bindMenus() {
    $('btnResume').onclick = () => this.setState('play');
    $('btnTug').onclick = () => {
      if (this.save.pearls < 30) { this.hud.toast('Not enough pearls for the tug.', 'bad'); return; }
      this.save.pearls -= 30;
      this.respawn();
      this.setState('play');
      this.hud.toast('A grumpy tugboat drags you home.', '');
    };
    $('btnMute').onclick = () => { this.sound.setMuted(!this.sound.muted); $('btnMute').textContent = `Sound: ${this.sound.muted ? 'off' : 'on'}`; };
    $('btnRespawn').onclick = () => this.respawnFromDeath();
    this.buildTitle();
  }
  buildTitle() {
    const box = $('titleButtons');
    box.innerHTML = '';
    const has = !!loadSave();
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = label; b.onclick = fn; box.appendChild(b); return b; };
    if (has) mk('Continue voyage', '', () => this.begin(false));
    mk(has ? 'New voyage' : 'Dive in', has ? 'alt' : '', () => this.begin(true));
  }

  begin(fresh) {
    this.sound.init();
    if (fresh) {
      clearSave();
      this.resetWorlds(newSave());
    }
    this.sub.equip(this.save.equip);
    this.respawn(true);
    $('title').classList.add('hidden');
    this.hud.show(true);
    this.setState('play');
    if (fresh || !this.save.flags.met_pim) {
      this.hud.banner('Puddle', 'Home. Warm, shallow, and full of fish.');
      setTimeout(() => this.hud.toast('Swim right up to Barnacle Bay\'s jetty and press <b>E</b> to dock.', '', 'hint-dock', 30), 2500);
    }
    this.lastWorld = this.sub.env ? this.sub.env.w : null;
  }

  /** Rebuild every world's populated content for a fresh save. */
  resetWorlds(save) {
    for (const w of this.worlds) this.scene.remove(w.group);
    this.worlds = WORLDS.map((d) => new World(d));
    for (const w of this.worlds) this.scene.add(w.group);
    this.kraken = null; this.storm = null;
    this.populate(save);
  }

  setState(s) {
    this.state = s;
    $('pause').classList.toggle('hidden', s !== 'pause');
    $('dead').classList.toggle('hidden', s !== 'dead');
    if (s === 'play') this.clock.getDelta();
  }

  // ------------------------------------------------------------------ dialog API
  api() {
    const g = this, s = this.save, sub = this.sub;
    return {
      save: s, sound: this.sound, closing: false,
      pearls: () => s.pearls,
      spend: (n) => { if (s.pearls < n) return false; s.pearls -= n; return true; },
      give: (n) => { s.pearls += n; },
      flag: (k) => !!s.flags[k], setFlag: (k) => { s.flags[k] = true; },
      memo(v) { if (v === undefined) return g._memo; g._memo = v; },
      hullPct: () => sub.hull / sub.st.hp,
      repair: () => { sub.hull = sub.st.hp; sub.fuel = sub.st.fuel; },
      paidRepair: (rate) => {
        const need = Math.ceil(sub.st.hp - sub.hull), can = Math.min(need, Math.floor(s.pearls / rate));
        s.pearls -= can * rate; sub.hull = Math.min(sub.st.hp, sub.hull + can);
        g.hud.toast(can ? `Fixed ${can} dents for ${can * rate} pearls.` : 'You can\'t afford a single dent.', can ? 'good' : 'bad');
      },
      reveal: (id) => { s.map[id].known = true; },
      known: (id) => s.map[id].known,
      owned: (slot, id) => s.owned[slot].includes(id),
      grant: (slot, id) => { if (!s.owned[slot].includes(id)) s.owned[slot].push(id); },
      lit: (id) => !!s.lit[id],
      beacons: () => Object.keys(s.lit).length,
      here: () => (sub.env ? sub.env.w.id : 'puddle'),
      openShop: (enc) => { g.state = 'shop'; g.shop.start(enc, g.api(), () => { g.setState('play'); writeSave(s); }); },
      equipChanged: () => { sub.equip(s.equip); },
      toast: (m, k) => g.hud.toast(m, k),
      win: () => g.win(),
    };
  }

  openEncounter(id, place) {
    const enc = ENCOUNTERS[id];
    this.state = 'dialog';
    this.sound.dock();
    this.dialog.start(enc, this.api(), () => { this.setState('play'); writeSave(this.save); }, place);
  }

  // ------------------------------------------------------------------ events
  onSplash(w, th, speed, entering) {
    w.splash(th, entering ? -speed * 0.5 : speed * 0.3, 3);
    const p = w.globalXY(th, w.surface(th));
    this.fx.splash(p.x, p.y, Math.cos(th), Math.sin(th), speed * (entering ? 0.9 : 0.55), w.def.pal.waterTop);
    this.sound.splash(speed);
    if (entering && speed > 22) this.shake = Math.min(1, speed / 50);
  }
  damage(amount, kind) {
    if (this.god || this.state !== 'play') return;
    const s = this.sub;
    s.hull -= amount;
    if (kind === 'pressure') {
      this.creakT = (this.creakT || 0) - 1 / 60;
      if (this.creakT <= 0) { this.creakT = 1.4; this.sound.creak(); this.shake = 0.15; }
    } else {
      this.hurtFlash = 0.7;
      this.shake = Math.max(this.shake, 0.5);
      this.sound.hurt();
    }
    if (s.hull <= 0) this.die(kind);
  }
  bite(x, y, dmg, name) {
    const s = this.sub;
    if (s.inv > 0 || this.god) return;
    const dx = s.pos.x - x, dy = s.pos.y - y, l = Math.hypot(dx, dy) || 1;
    s.vel.x += (dx / l) * 16; s.vel.y += (dy / l) * 16;
    s.inv = 1.2;
    this.fx.sparkle(s.pos.x, s.pos.y, 0xff6b6b, 12, 8);
    this.damage(dmg, name);
  }
  die(kind) {
    this.state = 'dead';
    const lost = Math.floor(this.save.pearls * 0.2);
    this.save.pearls -= lost;
    const why = { pressure: 'The pressure squeezed your hull like a tin of sardines.', eel: 'An eel chewed through the hull.', angler: 'The angler swallowed you whole, then spat you out. Rude.', kraken: 'A tentacle swatted you clean out of the sea.', jelly: 'Stung one time too many.', bonk: 'You bonked into one rock too many.' }[kind] || 'Your sub sprang a leak.';
    $('deadText').innerHTML = `${why}<br><br>A salvage crew tows you back to <b>${this.portName(this.save.lastPort)}</b>. They keep ${lost} pearls for their trouble.`;
    this.setState('dead');
    writeSave(this.save);
  }
  respawnFromDeath() {
    this.respawn();
    this.setState('play');
  }
  respawn(keepHull = false) {
    const pid = this.save.lastPort;
    const w = this.worlds.find((x) => x.def.ports.some((p) => p.id === pid)) || this.worlds[0];
    const port = w.def.ports.find((p) => p.id === pid) || w.def.ports[0];
    this.sub.pos.copy(w.globalXY(port.at, w.R - 5));
    this.sub.vel.set(0, 0);
    this.sub.angle = port.at + Math.PI / 2;
    if (!keepHull || this.sub.hull <= 0) this.sub.hull = this.sub.st.hp;
    this.sub.fuel = this.sub.st.fuel;
    this.sub.inv = 2;
    this.camUp = port.at;
    this.sub.step(0.001, { x: 0, y: 0, boost: false }, this.worlds, this);
    this.sub.ext.set(0, 0);
    this.lastWorld = w;
  }
  lightBeacon(w) {
    if (this.save.lit[w.id]) return;
    this.save.lit[w.id] = true;
    this.beaconObjs[w.id].light();
    this.save.map[w.id].seg = '1'.repeat(SEGS);
    this.sound.beacon();
    this.shake = 0.4;
    const b = this.beaconObjs[w.id];
    const p = w.globalXY(w.def.beacon.at, b.top);
    this.fx.sparkle(p.x, p.y, 0xffe27a, 60, 18);
    this.hud.banner('Beacon lit!', `${w.name} shines again · ${Object.keys(this.save.lit).length} / 5`);
    if (w.id !== 'maw' && this.litCount() === 4 && this.storm && this.storm.active) {
      this.storm.setActive(false);
      this.save.map.maw.known = true;
      setTimeout(() => this.hud.toast('Four beacons burn! Far away, the storm around <b>The Maw</b> is lifting…', 'good'), 2500);
    }
    if (w.id === 'maw') setTimeout(() => this.openEncounter('kraken'), 1800);
    writeSave(this.save);
  }
  win() {
    this.save.won = true;
    if (this.kraken) this.kraken.calm = true;
    this.hud.banner('The seas are lit', 'Thank you for playing Puddlejumper');
    writeSave(this.save);
  }

  // ------------------------------------------------------------------ frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    if (this.state === 'title') this.titleFrame(dt);
    else this.playFrame(dt);
    this.shop.frame(this.t);
    this.renderer.render(this.scene, this.camera);
    this.edges.clear();
  }

  /** Debug/test helper: advance the simulation at a fixed step with scripted input. */
  simulate(seconds, input = null, keys = []) {
    this.forced = input;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      if (i === 0) for (const k of keys) this.edges.add(k);
      this.t += 1 / 60;
      if (this.state === 'title') this.titleFrame(1 / 60); else this.playFrame(1 / 60);
      this.edges.clear();
    }
    this.forced = null;
    this.renderer.render(this.scene, this.camera);
    const s = this.sub, e = s.env;
    return { state: this.state, x: +s.pos.x.toFixed(1), y: +s.pos.y.toFixed(1), speed: +s.speed.toFixed(1), world: e.w.id, alt: +(e.r - e.surf).toFixed(1), depth: +e.below.toFixed(1), subm: +e.subm.toFixed(2), hull: +s.hull.toFixed(1), fuel: +s.fuel.toFixed(2), space: e.space };
  }

  titleFrame(dt) {
    this.titleT += dt;
    const w = this.worlds[0];
    const a = Math.PI / 2 + Math.sin(this.titleT * 0.05) * 0.6;
    const r = w.R + 10;
    this.camUp = a;
    const tx = w.c.x + Math.cos(a) * r, ty = w.c.y + Math.sin(a) * r;
    this.setCamera(tx, ty, 150, a);
    this.updateWorlds(dt, true, { x: tx, y: ty });
    this.sky(w, r, 0.85);
    if (this.edges.has('enter')) this.begin(!loadSave());
  }

  playFrame(dt) {
    const e0 = this.sub.env;
    if (this.edges.has('esc')) {
      if (this.dialog.open) { this.dialog.close(); }
      else if (this.shop.open) this.shop.close();
      else if (this.chart.open) { this.chart.close(); this.setState('play'); }
      else if (this.state === 'play') this.setState('pause');
      else if (this.state === 'pause') this.setState('play');
    }
    if (this.edges.has('help') && (this.state === 'play' || this.state === 'pause')) this.setState(this.state === 'play' ? 'pause' : 'play');
    if (this.edges.has('map') && (this.state === 'play' || this.chart.open)) {
      if (this.chart.open) { this.chart.close(); this.setState('play'); } else { this.state = 'map'; this.chart.start(this); }
    }
    if (this.state === 'dead' && (this.edges.has('enter') || this.edges.has('act'))) this.respawnFromDeath();

    if (this.state === 'play') {
      this.save.playtime += dt;
      if (this.edges.has('lamp')) { this.sub.lampOn = !this.sub.lampOn; this.sound.ui(); }
      if (DEBUG) {
        if (this.edges.has('dbgP')) this.save.pearls += 500;
        if (this.edges.has('dbgG')) { this.god = !this.god; this.hud.toast(`God mode ${this.god ? 'on' : 'off'}`); }
        if (this.edges.has('dbgK')) { for (const k of ['hull', 'engine', 'fins', 'rocket', 'lamp']) this.save.owned[k] = ['tincan', 'ray', 'bathy', 'paddle', 'twin', 'jet', 'stubby', 'wings', 'flukes', 'fizz', 'kettle', 'comet', 'candle', 'search', 'glowcap'].filter((id) => part(k, id)); this.hud.toast('All parts unlocked'); }
      }
      const input = this.readInput();
      const n = 2;
      for (let i = 0; i < n; i++) this.sub.step(dt / n, input, this.worlds, this);
      this.sub.ext.set(0, 0);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    }
    const sub = this.sub, e = sub.env;
    if (!e) return;
    const w = e.w;

    // Arrival banners and mood.
    if (!e.space && e.r < w.R + w.A && this.lastWorld !== w) {
      this.lastWorld = w;
      this.hud.banner(w.name, w.def.blurb);
      this.sound.mood = w.def.mood;
      if (!this.save.map[w.id].known) this.save.map[w.id].known = true;
      writeSave(this.save);
    }
    if (e.space && !this.save.flags.first_space && this.state === 'play') {
      this.save.flags.first_space = true;
      this.hud.toast('You\'ve slipped free of the world\'s pull! Nudge with the arrows and fall toward another world.', 'good');
    }

    // Camera.
    const alt = e.r - e.surf;
    let dist = 34 + clamp(alt, 0, 70) * 0.85 + sub.speed * 0.35;
    if (e.space || e.r > w.R + w.A) dist = lerp(dist, 300, smoothstep(w.R + w.A, w.R + w.A + w.F * 0.8, e.r));
    if (this.state === 'map' || this.state === 'shop' || this.state === 'dialog') dist = Math.min(dist, 30);
    this.camDist = damp(this.camDist, dist, 2, dt);
    this.camUp = dampAngle(this.camUp, e.th, e.space ? 0.6 : 2.5, dt);
    const lead = 0.25;
    const tx = sub.pos.x + sub.vel.x * lead, ty = sub.pos.y + sub.vel.y * lead;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake * 1.6;
    this.setCamera(tx + rand(-sh, sh), ty + rand(-sh, sh), this.camDist, this.camUp);

    const light = e.space || e.subm < 0.5 ? 1 : smoothLight(e.below, w.R);
    this.light = light;
    this.sky(w, e.r, light);
    this.updateWorlds(dt, this.state === 'play', sub.pos);
    sub.render(dt, this, light);

    if (this.state === 'play') {
      this.checkPickups(w);
      this.checkInteract();
      this.checkBeacons(w);
      this.discover(dt, e);
    }
    this.fx.update(this.state === 'play' || this.state === 'title' ? dt : 0, this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.sound.frame({ under: e.subm > 0.6, thrust: this.state === 'play' ? sub.thrust : 0, speed: sub.speed, boost: sub.boosting && this.state === 'play', space: e.space });
    this.hud.update(this);
    this.hud.drawArrows(this);
    this.saveT += dt;
    if (this.saveT > 6 && this.state === 'play') { this.saveT = 0; writeSave(this.save); }
    void e0;
  }

  setCamera(x, y, dist, upA) {
    const ux = Math.cos(upA), uy = Math.sin(upA);
    this.camera.position.set(x, y, dist);
    this.camera.up.set(ux, uy, 0);
    this.camera.lookAt(x, y, 0);
    this.camBasis.ux = ux; this.camBasis.uy = uy; this.camBasis.rx = uy; this.camBasis.ry = -ux;
    // Keep the sun over the viewer's shoulder, relative to the local "up".
    this.sun.position.set(x + (ux * 0.55 + uy * 0.3) * 100, y + (uy * 0.55 - ux * 0.3) * 100, 90);
    this.sun.target.position.set(x, y, 0);
  }

  sky(w, r, light) {
    const sky = 1 - smoothstep(w.R + w.A * 0.4, w.R + w.A + w.F * 0.55, r);
    this.scene.background.copy(SPACE_BG).lerp(w.pal.sky, sky);
    this.starMat.opacity = 1 - sky;
    for (const n of this.nebulae) n.material.opacity = (1 - sky) * 0.35;
    this.hemi.intensity = 0.35 + 1.5 * light;
    this.sun.intensity = 0.3 + 2.0 * light;
  }

  updateWorlds(dt, simulate, focus) {
    const ctx = {
      game: this, sub: this.sub, right: { x: this.camBasis.rx, y: this.camBasis.ry },
      near: (p, d) => Math.hypot(p.x - this.sub.pos.x, p.y - this.sub.pos.y) < d,
      contact: (gp, radius, dmg, name) => {
        if (this.state !== 'play') return;
        const s = this.sub;
        if (Math.hypot(gp.x - s.pos.x, gp.y - s.pos.y) < radius + 1.15 && s.inv <= 0) {
          if (name === 'jelly') this.sound.zap();
          this.bite(gp.x, gp.y, dmg, name);
        }
      },
    };
    const env = this.sub.env;
    for (const w of this.worlds) {
      const d = Math.hypot(w.c.x - focus.x, w.c.y - focus.y);
      const visible = d < w.R + this.camDist * 1.3 + 80;
      const active = d < w.influence + 60;
      w.update(dt, simulate && (env ? env.w === w : active), visible, env && env.w === w ? this.light ?? 1 : 1);
      if (active && (simulate || this.state === 'title')) {
        for (const c of w.creatures) c.update(dt, ctx);
        for (const t of w.things) t.update(dt, ctx);
        for (const p of this.pickups) if (p.w === w) p.update(dt);
      }
    }
  }

  checkPickups(w) {
    const s = this.sub;
    for (const p of this.pickups) {
      if (p.taken || p.w !== w) continue;
      const d = Math.hypot(p.gp.x - s.pos.x, p.gp.y - s.pos.y);
      if (d < (p.kind === 'crate' ? 3.2 : 2.6)) {
        p.take();
        this.save.taken.push(p.id);
        if (p.kind === 'crate') {
          const v = 25;
          this.save.pearls += v;
          this.sound.chest();
          this.fx.sparkle(p.gp.x, p.gp.y, 0xffd36b, 30, 10);
          this.hud.toast(`A lost crate! +${v} pearls`, 'good');
        } else {
          this.save.pearls += 5;
          this.sound.pickup();
          this.fx.sparkle(p.gp.x, p.gp.y, 0xffe6fb, 12, 6);
        }
      }
    }
  }

  checkInteract() {
    const s = this.sub;
    let best = null, bd = Infinity;
    for (const it of this.interact) {
      if (it.w !== s.env.w) continue;
      const p = it.get ? it.get() : it.w.globalXY(it.th, it.r);
      const d = Math.hypot(p.x - s.pos.x, p.y - s.pos.y);
      if (d < it.radius && d < bd) { best = it; bd = d; }
    }
    this.hud.prompt(best ? `E — ${best.label}` : null);
    if (best && (this.edges.has('act') || this.edges.has('enter'))) {
      if (best.kind === 'port') {
        this.save.lastPort = best.id;
        s.fuel = s.st.fuel;
        this.save.map[best.w.id].known = true;
      }
      this.openEncounter(best.id);
    }
  }

  checkBeacons(w) {
    const b = this.beaconObjs[w.id];
    if (!b || this.save.lit[w.id]) return;
    if (w.id === 'maw' && this.litCount() < 4) return;
    const p = w.globalXY(w.def.beacon.at, w.ground(w.def.beacon.at) + 4);
    const d = Math.hypot(p.x - this.sub.pos.x, p.y - this.sub.pos.y);
    if (d < 11) this.lightBeacon(w);
    else if (d < 40) this.hud.toast(`The ${w.name} beacon is close: touch it to light it!`, '', `bk-${w.id}`, 20);
  }

  discover(dt, e) {
    this.discT -= dt;
    if (this.discT > 0) return;
    this.discT = 0.2;
    const w = e.w, m = this.save.map[w.id];
    if (e.r < w.R + w.A + 40) {
      const segA = TAU / SEGS, c = Math.floor(wrapAngle(e.th) / segA);
      const reach = e.r > w.R ? 3 : 2;
      let s = m.seg.split('');
      for (let k = -reach; k <= reach; k++) s[(c + k + SEGS) % SEGS] = '1';
      m.seg = s.join('');
    }
    for (const o of this.worlds) {
      if (this.save.map[o.id].known) continue;
      if (Math.hypot(o.c.x - this.sub.pos.x, o.c.y - this.sub.pos.y) < o.influence + 260) {
        this.save.map[o.id].known = true;
        this.hud.toast(`New world sighted: <b>${o.name}</b>!`, 'good');
      }
    }
  }
}

new Game();
