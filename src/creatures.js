import * as THREE from 'three';
import { TAU, clamp, angDiff, rand, lerp } from './util.js';
import { toon, outline, glowSprite, addEyes, orientSide } from './toon.js';

const v2 = new THREE.Vector2();

/** Clamp a local point into the water band of a world. */
function keepInWater(w, p, margin = 2) {
  const th = Math.atan2(p.y, p.x), r = Math.hypot(p.x, p.y);
  const lo = w.ground(th) + margin, hi = w.surface(th) - margin;
  const rr = clamp(r, lo, Math.max(lo, hi));
  if (rr !== r) p.set(Math.cos(th) * rr, Math.sin(th) * rr);
}
function steer(pos, heading, tx, ty, speed, turn, dt) {
  const want = Math.atan2(ty - pos.y, tx - pos.x);
  heading += clamp(angDiff(heading, want), -turn * dt, turn * dt);
  pos.x += Math.cos(heading) * speed * dt;
  pos.y += Math.sin(heading) * speed * dt;
  return heading;
}
const subLocal = (w, sub) => v2.set(sub.pos.x - w.c.x, sub.pos.y - w.c.y);

// ---------------------------------------------------------------- whale / narwhal
function buildWhale(narwhal) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = toon(narwhal ? '#9fb0c6' : '#4a78c2'), belly = toon(narwhal ? '#eef3f8' : '#f3e7c9');
  const main = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skin);
  main.scale.set(12, 4.6, 5);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
  head.scale.set(5.5, 4.4, 4.7); head.position.set(6.5, 0.5, 0);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), belly);
  bel.scale.set(11, 3.0, 4.3); bel.position.set(1.5, -2.0, 0);
  body.add(main, head, bel);
  for (let i = 0; i < 5; i++) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 0.2), toon(narwhal ? '#c9d4e2' : '#d9c9a3'));
    groove.position.set(4, -2.6 - i * 0.35, 3.6 - i * 0.2);
    groove.userData.noOutline = true;
    body.add(groove);
  }
  if (narwhal) {
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), toon('#5f6f86'));
      s.position.set(rand(-9, 6), rand(0.5, 3.8), rand(-3.5, 3.5));
      s.scale.set(1.4, 0.6, 1);
      s.userData.noOutline = true;
      body.add(s);
    }
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.45, 11, 10), toon('#fff4d6'));
    tusk.rotation.z = -Math.PI / 2; tusk.position.set(16, 0.8, 0);
    body.add(tusk);
  } else {
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), toon('#d8dbe6'));
      b.position.set(rand(-4, 7), rand(3.8, 4.5), rand(-1.5, 1.5));
      body.add(b);
    }
  }
  addEyes(body, 8.4, -0.6, 3.9, 0.75);
  for (const s of [1, -1]) {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), skin);
    fin.scale.set(3, 0.5, 1.3); fin.position.set(3, -3.2, s * 4); fin.rotation.set(0, s * 0.4, -0.6);
    body.add(fin);
  }
  const tail = new THREE.Group();
  tail.position.x = -10;
  const stalk = new THREE.Mesh(new THREE.ConeGeometry(3.2, 9, 16), skin);
  stalk.rotation.z = Math.PI / 2; stalk.position.x = -3.5;
  const fluke = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), skin);
  fluke.scale.set(2.4, 0.5, 6); fluke.position.x = -8;
  const notch = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), skin);
  notch.scale.set(2.2, 3.2, 0.6); notch.position.x = -8.4;
  tail.add(stalk, fluke, notch);
  body.add(tail);
  outline(root, 0.035);
  return { root, body, tail };
}

export class Whale {
  constructor(w, o, game) {
    Object.assign(this, { w, o, game, name: o.id });
    this.th = o.at; this.base = w.R - o.depth; this.r = this.base;
    this.rollSt = { roll: 0 }; this.heading = 0;
    this.breachT = -1; this.nextBreach = rand(12, 25); this.songT = rand(2, 6);
    this.m = buildWhale(o.narwhal);
    if (o.narwhal) this.m.root.scale.setScalar(0.6);
    w.group.add(this.m.root);
    this.lp = new THREE.Vector2(Math.cos(this.th) * this.r, Math.sin(this.th) * this.r);
    this.under = true;
    this.gp = new THREE.Vector2();
  }
  update(dt, ctx) {
    const w = this.w;
    let r, spd = this.o.speed;
    if (this.breachT >= 0) {
      this.breachT += dt;
      const p = this.breachT / 6;
      if (p >= 1) { this.breachT = -1; this.nextBreach = rand(25, 45); }
      r = this.base + (w.R + (this.o.narwhal ? 7 : 11) - this.base) * Math.sin(Math.PI * Math.min(p, 1));
      spd *= 1.8;
    } else {
      this.nextBreach -= dt;
      if (this.nextBreach <= 0 && !w.inIce(this.th) && !w.inIce(this.th + 0.35)) this.breachT = 0;
      r = this.base + 3 * Math.sin(w.t * 0.35);
    }
    // Keep clear of the seabed.
    r = Math.max(r, w.ground(this.th + 0.08) + 6, w.ground(this.th) + 6);
    this.th += spd * dt;
    const nx = Math.cos(this.th) * r, ny = Math.sin(this.th) * r;
    this.heading = Math.atan2(ny - this.lp.y, nx - this.lp.x);
    this.lp.set(nx, ny);
    this.r = r;
    const under = r < w.surface(this.th);
    if (under !== this.under && this.breachT >= 0) {
      const g = w.globalXY(this.th, w.R);
      w.splash(this.th, under ? -16 : 12, 7);
      ctx.game.fx.splash(g.x, g.y, Math.cos(this.th), Math.sin(this.th), 26);
      if (ctx.near(g, 120)) ctx.game.sound.splash(30);
    }
    this.under = under;
    this.m.root.position.set(nx, ny, -6);
    orientSide(this.m.root, this.heading, ctx.right.x, ctx.right.y, this.rollSt, dt, 1.5);
    this.m.tail.rotation.z = Math.sin(w.t * 1.6) * 0.25;
    this.gp.set(w.c.x + nx, w.c.y + ny);

    // Slipstream + song.
    const sl = subLocal(w, ctx.sub), d = Math.hypot(sl.x - nx, sl.y - ny);
    const reach = this.o.narwhal ? 12 : 18;
    if (d < reach && ctx.sub.subm > 0.5) {
      const f = 16 * (1 - d / reach);
      ctx.sub.ext.x += Math.cos(this.heading) * f; ctx.sub.ext.y += Math.sin(this.heading) * f;
    }
    this.songT -= dt;
    if (this.songT <= 0) {
      this.songT = rand(7, 12);
      if (d < 60) ctx.game.sound.whale();
    }
  }
}

// ---------------------------------------------------------------- jellyfish
export class Jelly {
  constructor(w, i, game) {
    const rng = w.rng;
    this.w = w;
    let th, g;
    for (let k = 0; k < 20; k++) { th = rng() * TAU; g = w.ground(th); if (g < w.R - 18) break; }
    this.th = th; this.base = lerp(g + 6, w.R - 8, rng()); this.ph = rng() * TAU;
    this.dir = rng() < 0.5 ? -1 : 1;
    const color = w.pal.coral[i % w.pal.coral.length];
    const root = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 10, 0, TAU, 0, Math.PI / 2),
      toon(color, { transparent: true, opacity: 0.82, emissive: color, emissiveIntensity: 0.45, unique: true }));
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
    inner.position.y = 0.4;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.12, 6, 20), toon(color));
    rim.rotation.x = Math.PI / 2;
    root.add(dome, inner, rim, glowSprite(color, 7, 0.45));
    this.tents = [];
    for (let k = 0; k < 6; k++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.02, 3.6, 5), toon(color));
      t.geometry.translate(0, -1.8, 0);
      const a = (k / 6) * TAU;
      t.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
      root.add(t);
      this.tents.push(t);
    }
    this.dome = dome;
    this.root = root;
    w.group.add(root);
    this.gp = new THREE.Vector2();
  }
  update(dt, ctx) {
    const w = this.w, t = w.t + this.ph;
    this.th += this.dir * 0.004 * dt;
    const pulse = Math.sin(t * 2.2);
    let r = this.base + Math.sin(t * 0.4) * 5;
    r = clamp(r, w.ground(this.th) + 4, w.surface(this.th) - 2.5);
    w.place(this.root, this.th, r, -2 + Math.sin(this.ph) * 4);
    this.dome.scale.set(1 + pulse * 0.12, 1 - pulse * 0.15, 1 + pulse * 0.12);
    this.tents.forEach((tn, k) => { tn.rotation.z = Math.sin(t * 2 + k) * 0.3; tn.rotation.x = Math.cos(t * 1.7 + k) * 0.2; });
    w.globalXY(this.th, r, this.gp);
    ctx.contact(this.gp, 1.7, 6, 'jelly');
  }
}

// ---------------------------------------------------------------- eel
export class Eel {
  constructor(w, o, game) {
    this.w = w; this.o = o;
    this.home = new THREE.Vector2(Math.cos(o.at) * (w.R - o.depth), Math.sin(o.at) * (w.R - o.depth));
    this.head = this.home.clone();
    this.heading = rand(0, TAU);
    this.wander = this.home.clone(); this.wanderT = 0;
    this.state = 'patrol'; this.stateT = 0; this.biteCd = 0;
    this.N = 16; this.spacing = 1.15;
    this.segs = [];
    this.meshes = [];
    const cA = w.id === 'ember' ? '#ffcf3a' : w.id === 'maw' ? '#ff4ad8' : '#9be23a';
    const cB = w.id === 'ember' ? '#d14b2a' : w.id === 'maw' ? '#5a2bb0' : '#3c7a2a';
    for (let i = 0; i < this.N; i++) {
      this.segs.push(this.head.clone().add(new THREE.Vector2(-i * this.spacing, 0)));
      const rr = 1.05 * (1 - i / (this.N + 3)) + 0.2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 12, 8), toon(i % 3 === 0 ? cB : cA));
      outline(m, 0.08);
      w.group.add(m);
      this.meshes.push(m);
    }
    // Head
    const hg = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), toon(cA));
    skull.scale.set(2.0, 1.05, 1.1);
    this.jaw = new THREE.Group();
    const jawM = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2), toon(cB));
    jawM.scale.set(1.9, 0.6, 1.0);
    this.jaw.add(jawM);
    this.jaw.position.set(-0.3, -0.25, 0);
    for (let i = 0; i < 4; i++) {
      for (const s of [1, -1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), toon('#ffffff'));
        tooth.position.set(1.6 - i * 0.4, -0.15, s * 0.6); tooth.rotation.z = Math.PI;
        tooth.userData.noOutline = true;
        skull.add(tooth);
      }
    }
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4), toon(cB));
    fin.position.set(-0.8, 1.0, 0); fin.rotation.z = 0.8; fin.scale.z = 0.3;
    hg.add(skull, this.jaw, fin);
    addEyes(hg, 0.9, 0.55, 0.65, 0.32, '#15122e', '#fff36b');
    outline(hg, 0.06);
    this.hg = hg;
    this.rollSt = { roll: 0 };
    w.group.add(hg);
    this.gp = new THREE.Vector2();
  }
  update(dt, ctx) {
    const w = this.w, sub = ctx.sub;
    const sl = subLocal(w, sub);
    const dSub = sl.distanceTo(this.head), dHome = this.head.distanceTo(this.home);
    const subWet = sub.subm > 0.4 && sub.env && sub.env.w === w;
    this.biteCd -= dt; this.stateT -= dt;
    let speed = 7, turn = 2.2, tx, ty;
    if (this.state === 'patrol') {
      this.wanderT -= dt;
      if (this.wanderT <= 0 || this.head.distanceTo(this.wander) < 3) {
        this.wanderT = 4;
        const a = rand(0, TAU), rr = rand(5, 22);
        this.wander.set(this.home.x + Math.cos(a) * rr, this.home.y + Math.sin(a) * rr);
        keepInWater(w, this.wander, 4);
      }
      tx = this.wander.x; ty = this.wander.y;
      if (subWet && dSub < 30 && sl.distanceTo(this.home) < 55 && !ctx.game.god) {
        this.state = 'chase'; this.stateT = 7; ctx.game.sound.growl();
        ctx.game.toast('An eel has your scent! Leap out of the water to shake it.', 'bad', 'eel');
      }
    } else if (this.state === 'chase') {
      speed = 14.5; turn = 3.2; tx = sl.x; ty = sl.y;
      if (!subWet || this.stateT <= 0 || dHome > 65) { this.state = 'return'; this.stateT = 3; }
      if (dSub < 2.6 && this.biteCd <= 0) {
        this.biteCd = 1.3;
        ctx.game.bite(this.head.x + w.c.x, this.head.y + w.c.y, 14, 'eel');
        this.state = 'return'; this.stateT = 1.5;
      }
    } else {
      speed = 9; tx = this.home.x; ty = this.home.y;
      if (this.stateT <= 0 || dHome < 8) this.state = 'patrol';
    }
    this.heading = steer(this.head, this.heading, tx, ty, speed, turn, dt);
    // Wiggle.
    this.heading += Math.sin(w.t * 6) * 0.6 * dt;
    keepInWater(w, this.head, 2);
    this.segs[0].copy(this.head);
    for (let i = 1; i < this.N; i++) {
      const a = this.segs[i - 1], b = this.segs[i];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      b.set(a.x + (dx / l) * this.spacing, a.y + (dy / l) * this.spacing);
    }
    for (let i = 0; i < this.N; i++) this.meshes[i].position.set(this.segs[i].x, this.segs[i].y, Math.sin(w.t * 3 + i * 0.5) * 0.3);
    this.hg.position.set(this.head.x + Math.cos(this.heading) * 1.0, this.head.y + Math.sin(this.heading) * 1.0, 0.2);
    orientSide(this.hg, this.heading, ctx.right.x, ctx.right.y, this.rollSt, dt);
    this.jaw.rotation.z = this.state === 'chase' ? -0.35 - Math.sin(w.t * 12) * 0.2 : -0.08;
    this.gp.set(this.head.x + w.c.x, this.head.y + w.c.y);
  }
}

// ---------------------------------------------------------------- angler
export class Angler {
  constructor(w, o, game) {
    this.w = w; this.o = o;
    this.home = new THREE.Vector2(Math.cos(o.at) * (w.R - o.depth), Math.sin(o.at) * (w.R - o.depth));
    this.pos = this.home.clone(); this.heading = 0; this.state = 'lurk'; this.stateT = 0; this.biteCd = 0;
    this.rollSt = { roll: 0 };
    const root = new THREE.Group();
    const skin = toon('#3a2a5e'), dark = toon('#241838');
    const head = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 18), skin);
    head.scale.set(1.1, 1, 0.95);
    const tailC = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 14), skin);
    tailC.rotation.z = Math.PI / 2; tailC.position.x = -6;
    const tailF = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), dark);
    tailF.scale.set(1.6, 2.8, 0.4); tailF.position.x = -9.5;
    this.jaw = new THREE.Group();
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(3.9, 20, 12, 0, TAU, Math.PI / 2, Math.PI / 2), dark);
    jaw.scale.set(1.2, 0.8, 0.95);
    this.jaw.add(jaw);
    this.jaw.position.set(0.6, -0.6, 0);
    for (let i = 0; i < 7; i++) {
      for (const s of [1, -1]) {
        const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.3, 5), toon('#fffbe6'));
        const a = -0.2 + i * 0.25;
        t1.position.set(Math.cos(a) * 4.2 - 0.5, -0.4, s * (1 + i * 0.25));
        t1.rotation.z = Math.PI;
        t1.userData.noOutline = true;
        root.add(t1);
        const t2 = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 5), toon('#fffbe6'));
        t2.position.set(Math.cos(a) * 4.2 - 0.4, -0.2, s * (1 + i * 0.25));
        t2.userData.noOutline = true;
        this.jaw.add(t2);
      }
    }
    root.add(head, tailC, tailF, this.jaw);
    addEyes(root, 2.2, 1.8, 2.9, 1.1, '#15122e', '#fff36b');
    // Lure
    this.lure = new THREE.Group();
    let px = 0.5, py = 3.9;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6), dark);
      const a = 0.2 - i * 0.45;
      seg.position.set(px + Math.sin(-a) * 0.8, py + Math.cos(a) * 0.8, 0); seg.rotation.z = a;
      px += Math.sin(-a) * 1.6; py += Math.cos(a) * 1.6;
      this.lure.add(seg);
    }
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: '#c8fff0' }));
    this.bulb.position.set(px + 0.2, py - 0.3, 0);
    this.bulbGlow = glowSprite('#7dffe0', 9, 0.9);
    this.bulbGlow.position.copy(this.bulb.position);
    this.lure.add(this.bulb, this.bulbGlow);
    root.add(this.lure);
    outline(root, 0.04);
    this.root = root;
    w.group.add(root);
    this.gp = new THREE.Vector2();
  }
  update(dt, ctx) {
    const w = this.w, sub = ctx.sub, sl = subLocal(w, sub);
    const dSub = sl.distanceTo(this.pos), dHome = this.pos.distanceTo(this.home);
    const subWet = sub.subm > 0.4 && sub.env && sub.env.w === w;
    const lit = sub.lampOn && !sub.st.sneaky;
    const notice = lit ? 34 : 9;
    this.biteCd -= dt; this.stateT -= dt;
    let speed = 2, turn = 1.2, tx, ty;
    if (this.state === 'lurk') {
      tx = this.home.x + Math.cos(w.t * 0.3) * 6; ty = this.home.y + Math.sin(w.t * 0.4) * 3;
      if (subWet && dSub < notice && !ctx.game.god) {
        this.state = 'chase'; this.stateT = 8; ctx.game.sound.growl();
        ctx.game.toast(lit ? 'Something in the deep saw your light… (L to douse it)' : 'You bumped into something big!', 'bad', 'angler');
      }
    } else if (this.state === 'chase') {
      speed = 12.5; turn = 2.4; tx = sl.x; ty = sl.y;
      if (!subWet || this.stateT <= 0 || dHome > 55 || (!lit && dSub > 16)) { this.state = 'return'; this.stateT = 4; }
      if (dSub < 4.5 && this.biteCd <= 0) {
        this.biteCd = 1.6;
        ctx.game.bite(this.pos.x + w.c.x + Math.cos(this.heading) * 3, this.pos.y + w.c.y + Math.sin(this.heading) * 3, 24, 'angler');
        this.state = 'return'; this.stateT = 2.5;
      }
    } else {
      speed = 6; tx = this.home.x; ty = this.home.y;
      if (dHome < 5 || this.stateT <= 0) this.state = 'lurk';
    }
    this.heading = steer(this.pos, this.heading, tx, ty, speed, turn, dt);
    keepInWater(w, this.pos, 4.5);
    this.root.position.set(this.pos.x, this.pos.y, 0);
    orientSide(this.root, this.heading, ctx.right.x, ctx.right.y, this.rollSt, dt, 3);
    this.jaw.rotation.z = this.state === 'chase' ? -0.45 - Math.sin(w.t * 9) * 0.25 : -0.08 - Math.sin(w.t) * 0.04;
    this.lure.rotation.z = Math.sin(w.t * 1.3) * 0.12;
    this.bulbGlow.material.opacity = 0.6 + Math.sin(w.t * 3) * 0.3;
    this.gp.set(this.pos.x + w.c.x, this.pos.y + w.c.y);
    ctx.contact(this.gp, 3.8, 10, 'angler');
  }
}

// ---------------------------------------------------------------- kraken
export class Kraken {
  constructor(w, o, game) {
    this.w = w; this.o = o; this.game = game;
    const gr = w.ground(o.at);
    this.base = new THREE.Vector2(Math.cos(o.at) * (gr + 14), Math.sin(o.at) * (gr + 14));
    this.up = new THREE.Vector2(Math.cos(o.at), Math.sin(o.at));
    this.calm = false;
    const root = new THREE.Group();
    this.skin = toon('#7b3fb8', { unique: true });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.skin);
    head.scale.set(9, 12, 9); head.position.y = 8;
    const mantleSpots = toon('#c78bff');
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random(), 8, 6), mantleSpots);
      const a = rand(-1.2, 1.2), b = rand(0.2, 1.5);
      s.position.set(Math.sin(a) * 8.6 * Math.sin(b), 8 + Math.cos(b) * 11.5, Math.cos(a) * 8.6 * Math.sin(b));
      s.userData.noOutline = true;
      root.add(s);
    }
    root.add(head);
    this.eyes = addEyes(root, 0, 2.5, 7.6, 2.4, '#15122e', '#fff36b');
    this.brow = [];
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 0.8), toon('#3a1a5e'));
      b.position.set(0, 5.4, s * 8.2); b.rotation.z = s * 0.3;
      root.add(b);
      this.brow.push(b);
    }
    outline(root, 0.03);
    this.root = root;
    w.group.add(root);
    root.position.set(this.base.x, this.base.y, -4);
    root.rotation.z = o.at - Math.PI / 2;
    // Tentacles: chains placed directly in world-local space.
    this.tents = [];
    const segN = 13;
    for (let k = 0; k < 8; k++) {
      const meshes = [];
      for (let i = 0; i < segN; i++) {
        const rr = 1.7 * (1 - i / (segN + 2)) + 0.25;
        const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 10, 8), i % 2 ? this.skin : toon('#9a5ad8'));
        outline(m, 0.06);
        w.group.add(m);
        meshes.push(m);
      }
      this.tents.push({ meshes, base: -Math.PI / 2 + ((k - 3.5) / 3.5) * 2.1, z: -9 + k * 2.3, ph: k * 1.3, pts: [] });
    }
    this.gp = new THREE.Vector2();
    this.roarT = 0;
  }
  update(dt, ctx) {
    const w = this.w, t = w.t, sl = subLocal(w, ctx.sub);
    const ang0 = Math.atan2(this.up.y, this.up.x) - Math.PI / 2; // kraken frame rotation
    const cx = this.base.x + this.up.x * 2, cy = this.base.y + this.up.y * 2;
    const dSub = Math.hypot(sl.x - cx, sl.y - cy);
    const angry = !this.calm && dSub < 60 && !ctx.game.god;
    this.roarT -= dt;
    if (angry && this.roarT <= 0 && dSub < 45) { this.roarT = 9; ctx.game.sound.growl(); }
    for (const tn of this.tents) {
      let a = ang0 + tn.base, x = cx, y = cy;
      const reach = angry ? Math.atan2(sl.y - cy, sl.x - cx) : null;
      for (let i = 0; i < tn.meshes.length; i++) {
        const f = i / tn.meshes.length;
        let da = Math.sin(t * (angry ? 2.4 : 1.1) + tn.ph - i * 0.45) * 0.22 * (0.3 + f);
        if (reach !== null && Math.abs(angDiff(ang0 + tn.base, reach)) < 1.2) da += clamp(angDiff(a, reach), -0.35, 0.35) * 0.6;
        else da += (this.calm ? 0.06 : 0.02) * Math.sign(tn.base + Math.PI / 2 || 1);
        a += da;
        const len = 2.1 * (1 - f * 0.3);
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        tn.meshes[i].position.set(x, y, tn.z * 0.5);
        if (angry && i > 6) { this.gp.set(x + w.c.x, y + w.c.y); ctx.contact(this.gp, 1.4, 12, 'kraken'); }
      }
    }
    const bob = Math.sin(t * 0.8) * 1.2;
    this.root.position.set(this.base.x + this.up.x * bob, this.base.y + this.up.y * bob, -4);
    for (const b of this.brow) b.visible = !this.calm;
    if (this.calm) this.skin.color.lerp(new THREE.Color('#ff9ad8'), dt);
  }
}

// ---------------------------------------------------------------- fish school
const fishGeo = (() => {
  const g = new THREE.ConeGeometry(0.4, 1.4, 6);
  g.rotateZ(-Math.PI / 2);
  return g;
})();
export class School {
  constructor(w, i, game) {
    const rng = w.rng;
    this.w = w;
    this.n = 18 + Math.floor(rng() * 10);
    let th, g;
    for (let k = 0; k < 20; k++) { th = rng() * TAU; g = w.ground(th); if (g < w.R - 15) break; }
    this.th = th; this.r = lerp(g + 5, w.R - 5, rng()); this.dir = rng() < 0.5 ? -1 : 1;
    this.speed = 0.04 + rng() * 0.03;
    this.flee = new THREE.Vector2();
    this.off = [];
    for (let k = 0; k < this.n; k++) this.off.push({ x: rand(-5, 5), y: rand(-2.5, 2.5), z: rand(-7, 5), ph: rand(0, TAU), s: rand(0.6, 1.2) });
    const col = w.pal.coral[i % w.pal.coral.length];
    this.mesh = new THREE.InstancedMesh(fishGeo, toon('#ffffff'), this.n);
    const c = new THREE.Color();
    for (let k = 0; k < this.n; k++) this.mesh.setColorAt(k, c.set(col).offsetHSL(rand(-0.04, 0.04), 0, rand(-0.1, 0.1)));
    this.mesh.frustumCulled = false;
    w.group.add(this.mesh);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  update(dt, ctx) {
    const w = this.w, t = w.t;
    const sl = subLocal(w, ctx.sub);
    const cx = Math.cos(this.th) * this.r, cy = Math.sin(this.th) * this.r;
    const d = Math.hypot(sl.x - cx, sl.y - cy);
    let spd = this.speed;
    if (d < 12) { spd *= 3; this.r += Math.sign(this.r - Math.hypot(sl.x, sl.y) || 1) * 6 * dt; }
    this.th += this.dir * spd * dt;
    this.r = clamp(this.r + Math.sin(t * 0.3 + this.n) * 0.5 * dt, w.ground(this.th) + 4, w.surface(this.th) - 3);
    const heading = this.th + (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const tx = -Math.sin(this.th) * this.dir, ty = Math.cos(this.th) * this.dir;
    const ux = Math.cos(this.th), uy = Math.sin(this.th);
    const facingLeft = Math.cos(heading) * ctx.right.x + Math.sin(heading) * ctx.right.y < 0;
    const scatter = d < 12 ? (12 - d) / 12 : 0;
    for (let k = 0; k < this.n; k++) {
      const o = this.off[k];
      const ox = o.x + Math.sin(t * 1.3 + o.ph) * 0.8, oy = o.y + Math.cos(t * 1.1 + o.ph) * 0.6;
      const sc = 1 + scatter * 1.8;
      this.p.set(cx + (tx * ox + ux * oy) * sc, cy + (ty * ox + uy * oy) * sc, o.z);
      this.e.set(facingLeft ? Math.PI : 0, 0, heading + Math.sin(t * 8 + o.ph) * 0.15, 'ZYX');
      this.q.setFromEuler(this.e);
      this.s.setScalar(o.s);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(k, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
