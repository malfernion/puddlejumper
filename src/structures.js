import * as THREE from 'three';
import { TAU, rand, angDiff } from './util.js';
import { toon, outline, glowSprite, addEyes } from './toon.js';

function buildNpcHome(w, npc) {
  const g = new THREE.Group();
  if (npc.style === 'bottle') {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7, 20), toon('#7fe0a0', { transparent: true, opacity: 0.45 }));
    glass.rotation.z = Math.PI / 2 - 0.15; glass.position.y = 2;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 2.4, 16), toon('#7fe0a0', { transparent: true, opacity: 0.45 }));
    neck.rotation.z = -Math.PI / 2 - 0.15; neck.position.set(4.5, 2.6, 0);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 1, 12), toon('#c8955a'));
    cork.rotation.z = -Math.PI / 2 - 0.15; cork.position.set(6.1, 2.85, 0);
    const crab = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), toon('#ff5a3c'));
    cb.scale.set(1.3, 0.8, 1);
    crab.add(cb);
    for (const s of [1, -1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), toon('#ff5a3c'));
      claw.position.set(s * 1.4, 0.4, 0.5);
      crab.add(claw);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), toon('#ff5a3c'));
      stalk.position.set(s * 0.35, 0.9, 0.3);
      crab.add(stalk);
    }
    addEyes(crab, 0, 1.3, 0.35, 0.22);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 12), toon('#222'));
    hat.position.set(0, 1.4, -0.3);
    crab.add(hat);
    crab.position.set(-0.5, 1.4, 0);
    crab.rotation.y = 0.8;
    g.add(cork, crab, glass, neck);
    g.userData.bob = crab;
  } else if (npc.style === 'grotto') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 14, 0, Math.PI, 0, Math.PI / 2), toon('#f0b6e8', { side: THREE.DoubleSide }));
    shell.rotation.x = -Math.PI / 2; shell.rotation.z = Math.PI; shell.position.z = -2;
    shell.scale.set(1, 1, 1.1);
    for (let i = 0; i < 7; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(5, 0.18, 6, 24, Math.PI), toon('#d080c8'));
      rib.rotation.y = (i / 6) * Math.PI - Math.PI / 2; rib.position.z = -2;
      rib.scale.set(1, 1.02, 1);
      g.add(rib);
    }
    const slug = new THREE.Mesh(new THREE.CapsuleGeometry(1, 2.2, 6, 12), toon('#b06bff'));
    slug.rotation.z = Math.PI / 2; slug.position.set(0, 1, 1);
    const head = new THREE.Group();
    head.position.set(1.8, 2.2, 1);
    for (const s of [1, -1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.4, 6), toon('#b06bff'));
      h.position.set(s * 0.4, 0.8, 0); h.rotation.z = -s * 0.3;
      head.add(h);
    }
    addEyes(head, 0, 0.1, 0.5, 0.3, '#2d0a4a');
    g.add(shell, slug, head);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 6), toon('#fff2d6'));
      c.position.set(-4 + i * 2, 0.3, 3);
      const fl = glowSprite('#ffb84a', 1.4, 0.9);
      fl.position.set(-4 + i * 2, 0.85, 3);
      g.add(c, fl);
    }
    g.add(glowSprite('#d07bff', 16, 0.35));
    g.userData.bob = slug;
  }
  outline(g, 0.04);
  w.place(g, npc.at, w.ground(npc.at) - 0.3, -1);
  w.group.add(g);
  return g;
}

export class Beacon {
  constructor(w, def, lit) {
    this.w = w; this.def = def; this.lit = false;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 7, 10), toon('#5b5f7a'));
    pole.position.y = 3.5;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 1.2, 12), toon('#4a4e66'));
    base.position.y = 0.4;
    const cage = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 5), toon('#e0a93b'));
      const a = (i / 6) * TAU;
      bar.position.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2);
      cage.add(bar);
    }
    const capTop = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 6), toon('#e0a93b'));
    capTop.position.y = 2;
    cage.add(capTop);
    cage.position.y = 8.3;
    this.bulbMat = new THREE.MeshBasicMaterial({ color: '#5a5d70' });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), this.bulbMat);
    this.bulb.position.y = 8.3;
    this.bulb.userData.noOutline = true;
    this.glow = glowSprite('#ffe27a', 22, 0);
    this.glow.position.y = 8.3;
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(5, 46, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.geometry.translate(0, 23, 0);
    this.beam.position.y = 8.3;
    this.beam.userData.noOutline = true;
    g.add(base, pole, cage, this.bulb, this.glow, this.beam);
    outline(g, 0.04);
    w.place(g, def.at, w.ground(def.at) - 0.3, -2);
    w.group.add(g);
    this.g = g;
    this.top = w.ground(def.at) + 8.3;
    if (lit) this.light(true);
  }
  light(instant = false) {
    this.lit = true;
    this.bulbMat.color.set('#fff6b0');
    this.glow.material.opacity = 1;
    this.beam.material.opacity = 0.22;
    if (!instant) this.flash = 1.5;
  }
  update(dt) {
    if (!this.lit) return;
    this.beam.rotation.z = Math.sin(this.w.t * 0.5) * 0.6;
    if (this.flash > 0) { this.flash -= dt; this.glow.scale.setScalar(22 + this.flash * 30); }
  }
}

export class Pickup {
  constructor(w, id, th, r, kind) {
    Object.assign(this, { w, id, th, r, kind, taken: false });
    const g = new THREE.Group();
    if (kind === 'crate') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.6), toon('#a8693f')));
      for (const x of [-0.6, 0.6]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.7, 1.7), toon('#e0a93b'));
        b.position.x = x;
        g.add(b);
      }
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2, 12, 1, false, 0, Math.PI), toon('#8a5530'));
      lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.y = 0.8;
      g.add(lid);
      g.add(glowSprite('#ffd36b', 6, 0.5));
      g.rotation.z = rand(-0.3, 0.3);
    } else {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), toon('#fff4fb', { emissive: '#ffd0f0', emissiveIntensity: 0.35 }));
      g.add(p, glowSprite('#ffd6f6', 3.2, 0.7));
    }
    outline(g, 0.07);
    this.g = g;
    this.gp = w.globalXY(th, r);
    w.place(g, th, r, 0);
    w.group.add(g);
  }
  update(dt) {
    if (this.taken) return;
    if (this.kind === 'pearl') {
      this.g.position.z = Math.sin(this.w.t * 2 + this.th * 10) * 0.3;
      this.g.children[0].scale.setScalar(1 + Math.sin(this.w.t * 3 + this.th * 7) * 0.08);
    }
  }
  take() { this.taken = true; this.w.group.remove(this.g); }
}

export class Geyser {
  constructor(w, at, i) {
    Object.assign(this, { w, at, t: i * 2.3 });
    this.period = 7; this.active = 2.4;
    const g = new THREE.Group();
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 2.4, 12, 1, true), toon('#3a2a2a', { side: THREE.DoubleSide }));
    vent.position.y = 0.6;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.35, 8, 16), toon('#ff6a3d'));
    lip.rotation.x = Math.PI / 2; lip.position.y = 1.8;
    this.glow = glowSprite('#ff8a3d', 8, 0.6);
    this.glow.position.y = 1.8;
    g.add(vent, lip, this.glow);
    outline(g, 0.05);
    w.place(g, at, w.ground(at) - 0.4, 0);
    w.group.add(g);
    this.on = false;
  }
  update(dt, ctx) {
    const w = this.w;
    this.t += dt;
    const ph = this.t % this.period;
    const on = ph > this.period - this.active;
    const warm = ph > this.period - this.active - 1.2;
    if (on && !this.on && ctx.near(w.globalXY(this.at, w.R), 90)) ctx.game.sound.geyser();
    this.on = on;
    this.glow.material.opacity = on ? 1 : warm ? 0.5 + Math.random() * 0.4 : 0.35;
    const g0 = w.ground(this.at);
    const base = w.globalXY(this.at, g0 + 1.5), ux = Math.cos(this.at), uy = Math.sin(this.at);
    if (on) {
      for (let k = 0; k < 3; k++) {
        const rr = rand(0, w.R - g0 + 6);
        const p = w.globalXY(this.at + rand(-1.2, 1.2) / w.R, g0 + rr);
        if (rr < w.R - g0) ctx.game.fx.bubbles(p.x, p.y, ux * 10, uy * 10, 1, 0.6);
        else ctx.game.fx.spawn({ x: p.x, y: p.y, vx: ux * rand(10, 20) + rand(-2, 2), vy: uy * rand(10, 20) + rand(-2, 2), ax: -ux * 14, ay: -uy * 14, life: 1, size: rand(0.5, 1), color: 0xffffff, alpha: 0.8 });
      }
      w.splash(this.at, 6 * dt * 10, 2);
    } else if (Math.random() < 0.1) ctx.game.fx.bubbles(base.x, base.y, ux * 3, uy * 3, 1, 0.5);
    // Push the sub.
    const sub = ctx.sub, [sth, sr] = w.polar(sub.pos.x, sub.pos.y);
    const lateral = Math.abs(angDiff(this.at, sth)) * sr;
    if (on && lateral < 3.2 && sr > g0 && sr < w.R + 14) {
      sub.ext.x += Math.cos(sth) * 46; sub.ext.y += Math.sin(sth) * 46;
    }
  }
}

/** The storm wall that walls off The Maw until the beacons are lit. */
export class Storm {
  constructor(w, scene) {
    this.w = w;
    this.r = w.influence - 15;
    this.puffs = [];
    const mat = toon('#2a1f4a');
    const mat2 = toon('#3d2c66');
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), i % 2 ? mat : mat2);
      m.scale.setScalar(rand(6, 14));
      m.userData = { a: (i / 90) * TAU, rr: this.r + rand(-8, 8), z: rand(-30, 4), s: rand(0.02, 0.05) };
      w.group.add(m);
      this.puffs.push(m);
    }
    this.bolt = new THREE.Mesh(new THREE.PlaneGeometry(4, 60), new THREE.MeshBasicMaterial({ color: '#f4f0ff', transparent: true, opacity: 0, depthWrite: false }));
    w.group.add(this.bolt);
    this.active = true;
    this.flashT = 2;
  }
  setActive(a) {
    this.active = a;
    for (const p of this.puffs) p.visible = a;
    this.bolt.visible = a;
  }
  update(dt, ctx) {
    if (!this.active) return;
    for (const p of this.puffs) {
      const u = p.userData;
      u.a += u.s * dt;
      p.position.set(Math.cos(u.a) * u.rr, Math.sin(u.a) * u.rr, u.z);
    }
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flashT = rand(1.5, 5);
      const a = rand(0, TAU);
      this.bolt.position.set(Math.cos(a) * this.r, Math.sin(a) * this.r, 6);
      this.bolt.rotation.z = a - Math.PI / 2 + rand(-0.3, 0.3);
      this.bolt.material.opacity = 1;
      if (ctx.near(this.w.globalXY(a, this.r), 260)) ctx.game.sound.thunder();
    }
    this.bolt.material.opacity = Math.max(0, this.bolt.material.opacity - dt * 3);
    const sub = ctx.sub, [th, r] = this.w.polar(sub.pos.x, sub.pos.y);
    if (r < this.r + 10 && r > this.w.R + 4) {
      const k = 70;
      sub.ext.x += Math.cos(th) * k; sub.ext.y += Math.sin(th) * k;
      sub.vel.multiplyScalar(0.97);
      ctx.game.toast('A howling storm hurls you back. The Maw is sealed until the four beacons burn.', 'bad', 'storm');
    }
  }
}

export { buildPort } from "./ports.js";
export { buildNpcHome };
