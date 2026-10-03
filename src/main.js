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
import { TouchControls } from './touch.js';
import { newSave, loadSave, writeSave, clearSave, SEGS } from './save.js';
import { TAU, clamp, damp, dampAngle, lerp, wrapAngle, smoothstep, rand } from './util.js';
import { glowSprite, SHARED } from './toon.js';
import { Rain, Lightning } from './weather.js';
import { Floater } from './floaters.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uStorm: { value: 0 }, uUnder: { value: 0 }, uHurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uFlash, uStorm, uUnder, uHurt; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5;
      float ca = dot(d, d) * 0.006 * (1.0 + uUnder);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.8 - 0.3 * uStorm);
      c = mix(c, c * vec3(0.86, 1.0, 1.08), (1.0 - l) * 0.45);
      c = mix(c, c * vec3(1.1, 1.0, 0.86), l * 0.3);
      c = (c - 0.5) * 1.06 + 0.5;
      c *= 1.0 - dot(d, d) * (1.25 + uUnder * 0.6 + uStorm * 0.5);
      c = mix(c, c * vec3(1.4, 0.45, 0.45), uHurt * dot(d, d) * 3.0);
      c += uFlash * vec3(0.75, 0.8, 0.95) * 0.55;
      float n = fract(sin(dot(vUv * vec2(1231.7, 4321.3) + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * 0.05;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const SPACE_BG = new THREE.Color('#070a1c');
const STORM_SKY = new THREE.Color('#3b4048');
const SUN_COL = new THREE.Color('#fff1dc');

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    $('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd8ff');
    this.scene.fog = new THREE.Fog(0x8fd8ff, 60, 300);
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 8000);
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.rain = new Rain(this.scene);
    this.lightning = new Lightning(this.scene);
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
    this.touch = new TouchControls(this);

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
        w.things.push({ update: (dt) => { g.traverse((o) => { if (o.userData.spin) o.rotation.z = Math.PI + Math.sin(w.t * o.userData.spin * 0.6) * 1.35; if (o.userData.waddle !== undefined) o.rotation.z = Math.sin(w.t * 6 + o.userData.waddle) * 0.15; }); if (g.userData.steam && Math.random() < 0.25) { const v = g.localToWorld(g.userData.steam.clone()); this.fx.puff(v.x, v.y, 0xe8e4dc, 1, 1.4); }
          for (const s of g.userData.smoke) {
            if (Math.random() > 0.12) continue;
            const v = g.localToWorld(s.clone()), [sth] = w.polar(v.x, v.y), wind = w.weather.windAccel * 0.4;
            const ux = Math.cos(sth), uy = Math.sin(sth);
            this.fx.spawn({ x: v.x, y: v.y, z: v.z, vx: ux * 1.6 - uy * wind, vy: uy * 1.6 + ux * wind, drag: 0.4, life: rand(2.5, 4), size: 0.6, size1: 2.6, color: 0x4a4744, alpha: 0.45 });
          } } });
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
      // Flotsam: physics bodies riding the waves.
      w.floaters = [];
      const kinds = ['barrel', 'barrel', 'log', 'crate', 'barrel', 'log', 'crate'];
      const addF = (kind, th) => { if (w.ground(th) > w.R - 3) return; const f = new Floater(w, kind, th); w.floaters.push(f); this.scene.add(f.root); };
      for (const p of d.ports) { addF('buoy', p.at + 0.14); addF('buoy', p.at - 0.16); }
      for (let i = 0; i < (d.flotsam ?? 6); i++) addF(kinds[i % kinds.length], rng() * TAU);
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
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.composer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    // Portrait phones: widen the vertical FOV so there's still some sea either side of the sub.
    this.camera.fov = this.camera.aspect < 1 ? 50 + (1 - this.camera.aspect) * 40 : 50;
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
    if (this.touch.active) { if (this.touch.x || this.touch.y) { x = this.touch.x; y = this.touch.y; } boost = boost || this.touch.boost; }
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
    $('chartClose').onclick = () => { this.chart.close(); this.setState('play'); };
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
    for (const w of this.worlds) { this.scene.remove(w.group); for (const f of w.floaters || []) this.scene.remove(f.root); }
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
    this.composer.render();
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
    this.composer.render();
    const s = this.sub, e = s.env;
    if (!e) return { state: this.state };
    return { state: this.state, x: +s.pos.x.toFixed(1), y: +s.pos.y.toFixed(1), speed: +s.speed.toFixed(1), world: e.w.id, alt: +(e.r - e.surf).toFixed(1), depth: +e.below.toFixed(1), subm: +e.subm.toFixed(2), hull: +s.hull.toFixed(1), fuel: +s.fuel.toFixed(2), space: e.space };
  }

  titleFrame(dt) {
    this.titleT += dt;
    const w = this.worlds[0];
    const a = Math.PI / 2 + Math.sin(this.titleT * 0.04) * 0.12;
    const r = w.R + 3;
    this.camUp = a;
    const tx = w.c.x + Math.cos(a) * r, ty = w.c.y + Math.sin(a) * r;
    this.camDist = 72;
    this.setCamera(tx, ty, 72, a);
    this.updateWorlds(dt, true, { x: tx, y: ty });
    this.sky(w, r, 0.85, false, dt);
    this.touch.show(false);
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
    this.sky(w, e.r, light, e.subm > 0.5, this.state === 'play' ? dt : 0);
    this.updateWorlds(dt, this.state === 'play', sub.pos);
    sub.render(dt, this, light);

    if (this.state === 'play') {
      this.checkPickups(w);
      this.checkInteract();
      this.checkBeacons(w);
      this.discover(dt, e);
    }
    this.fx.update(this.state === 'play' || this.state === 'title' ? dt : 0, this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.sound.frame({ under: e.subm > 0.6, thrust: this.state === 'play' ? sub.thrust : 0, speed: sub.speed, boost: sub.boosting && this.state === 'play', space: e.space, storm: e.space ? 0 : w.weather.storm, rain: e.space ? 0 : w.weather.rain });
    this.hud.update(this);
    this.hud.drawArrows(this);
    this.touch.show(this.state === 'play');
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

  /** Sky colour, lighting, fog, weather effects and shared shader uniforms for this frame. */
  sky(w, r, light, under = false, dt = 0) {
    const sky = 1 - smoothstep(w.R + w.A * 0.4, w.R + w.A + w.F * 0.55, r);
    const storm = w.weather.storm * sky;
    const skyCol = w.pal.sky.clone().lerp(STORM_SKY, storm * 0.8);
    this.scene.background.copy(SPACE_BG).lerp(skyCol, sky);
    this.starMat.opacity = 1 - sky;
    for (const n of this.nebulae) n.material.opacity = (1 - sky) * 0.35;
    const dim = 1 - storm * (under ? 0.35 : 0.55);
    this.hemi.intensity = (0.3 + 1.3 * light) * dim;
    this.sun.intensity = (0.25 + 2.4 * light) * (1 - storm * 0.75);
    this.sun.color.copy(SUN_COL).lerp(STORM_SKY, storm);
    // Depth haze: layers further into the screen fade toward the water or sky colour.
    const fog = this.scene.fog, d = this.camDist;
    if (under) {
      fog.color.copy(w.pal.waterDeep).lerp(w.pal.abyss, 1 - light).multiplyScalar(0.5 + 0.5 * light);
      fog.near = d * 0.6; fog.far = d + 30 + 60 * light;
    } else {
      fog.color.copy(this.scene.background);
      fog.near = d * 1.05 + 10 - storm * 15; fog.far = sky > 0.5 ? d * 1.6 + 110 - storm * 70 : 6000;
    }
    SHARED.uTime.value = this.t;
    SHARED.uWorldC.value.set(w.c.x, w.c.y, 0);
    SHARED.uSurfR.value = w.R;
    SHARED.uCaustic.value = sky * (1 - storm * 0.7);
    // Weather: rain box around the camera, lightning, thunder.
    const half = d * 0.75 + 10;
    this.rain.update(dt, w, this.camera.position.x, this.camera.position.y, half, this.fx);
    this.lightning.update(dt);
    if (w.weather.storm > 0.6 && sky > 0.3 && dt > 0) {
      this.lightning.timer -= dt;
      if (this.lightning.timer <= 0) {
        this.lightning.timer = rand(2.5, 9) / w.weather.storm;
        const [cth] = w.polar(this.camera.position.x, this.camera.position.y);
        const th = cth + rand(-0.4, 0.4) * (60 / w.R);
        this.lightning.strike(w, th);
        const dist = Math.hypot(w.c.x + Math.cos(th) * w.R - this.sub.pos.x, w.c.y + Math.sin(th) * w.R - this.sub.pos.y);
        setTimeout(() => this.sound.thunder(), Math.min(2500, dist * 8));
        w.splash(th, -6, 4);
      }
    }
    const u = this.grade.uniforms;
    u.uTime.value = this.t;
    u.uFlash.value = this.lightning.flash * sky * (under ? 0.4 : 1);
    u.uStorm.value = storm;
    u.uUnder.value = under ? 1 : 0;
    u.uHurt.value = this.hurtFlash || 0;
    this.storminess = storm;
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
        for (let s = 0; s < 2; s++) for (const f of w.floaters) f.step(dt / 2, this.sub, this, w.floaters);
      }
      // Whole-world culling: much of each world opts out of per-mesh frustum culling.
      w.group.visible = visible;
      for (const f of w.floaters) { f.root.visible = visible; if (visible) f.render(w.t); }
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
    this.hud.prompt(best ? `${this.touch.active ? '' : 'E — '}${best.label}` : null);
    this.touch.setActLabel(best ? { port: 'Dock', npc: 'Visit', talk: 'Hail' }[best.kind] : null);
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
