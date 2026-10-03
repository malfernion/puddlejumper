import * as THREE from 'three';
import { clamp, rand, angDiff, TAU } from './util.js';
import { toon, metal, woodMat, glowSprite } from './toon.js';

const tmpN = new THREE.Vector2();

// ---------------------------------------------------------------- models
function lathe(points, segs, mat) {
  return new THREE.Mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs), mat);
}

function barrelModel() {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, y = -1.1 + t * 2.2; prof.push([0.78 + Math.sin(t * Math.PI) * 0.16, y]); }
  const body = lathe([[0, -1.1], ...prof, [0, 1.1]], 22, woodMat('#7a4f2e', { scale: 3.5 }));
  g.add(body);
  // Stave seams.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.1, 0.06), toon('#3b2414', { grime: 0 }));
    s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
    s.rotation.y = -a;
    g.add(s);
  }
  for (const y of [-0.85, -0.3, 0.3, 0.85]) {
    const r = 0.8 + Math.sin(((y + 1.1) / 2.2) * Math.PI) * 0.16;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.05, 6, 28), metal('#5a5048'));
    hoop.rotation.x = Math.PI / 2; hoop.position.y = y;
    g.add(hoop);
  }
  const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), woodMat('#4a2e1a'));
  bung.rotation.x = Math.PI / 2; bung.position.set(0, 0, 0.97);
  g.add(bung);
  g.rotation.z = Math.PI / 2;
  const w = new THREE.Group(); w.add(g);
  return { root: w, radius: 1.0, density: 0.45, mass: 1.6 };
}

function buoyModel() {
  const g = new THREE.Group();
  const red = metal('#9a2b24', { rough: 0.6 }), white = metal('#d8d2c4', { rough: 0.6 });
  const body = lathe([[0, -1.6], [0.5, -1.55], [1.1, -1.0], [1.2, -0.4], [1.0, 0.2], [0.35, 0.5], [0, 0.5]], 24, red);
  g.add(body);
  const band = lathe([[1.21, -0.65], [1.23, -0.35], [1.12, -0.05]], 24, white);
  g.add(band);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6), metal('#3a3632'));
    leg.position.set(Math.cos(a) * 0.35, 1.3, Math.sin(a) * 0.35);
    leg.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
    g.add(leg);
  }
  const bell = lathe([[0, 0.1], [0.12, 0.08], [0.22, -0.2], [0.3, -0.4], [0, -0.4]], 14, metal('#b08a3a', { metal: 0.9, rough: 0.3 }));
  bell.position.y = 1.55;
  g.add(bell);
  const lampM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff5a3a' }));
  lampM.position.y = 2.35;
  const glow = glowSprite('#ff6a3a', 4, 0.8);
  glow.position.y = 2.35;
  g.add(lampM, glow);
  g.position.y = 0.4;
  const w = new THREE.Group(); w.add(g);
  return { root: w, radius: 1.2, density: 0.55, mass: 3, upright: true, glow };
}

function logModel() {
  const g = new THREE.Group();
  const bark = woodMat('#4e3a28', { scale: 2.5, grime: 0.9 });
  const len = rand(4, 6.5);
  const geo = new THREE.CylinderGeometry(0.45, 0.55, len, 12, 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + Math.sin(y * 3.1) * 0.06 + Math.sin(y * 7.3 + p.getX(i) * 4) * 0.04; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const trunk = new THREE.Mesh(geo, bark);
  trunk.rotation.z = Math.PI / 2;
  g.add(trunk);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), woodMat('#a8865a', { scale: 6 }));
    end.position.x = (s * len) / 2; end.rotation.y = (s * Math.PI) / 2;
    g.add(end);
  }
  for (let i = 0; i < 2; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, rand(1, 1.8), 6), bark);
    br.position.set(rand(-len / 3, len / 3), 0.6, rand(-0.3, 0.3)); br.rotation.z = rand(-0.8, 0.8);
    g.add(br);
  }
  return { root: g, radius: 0.6, density: 0.6, mass: 2.4, long: len / 2 };
}

function crateModel() {
  const g = new THREE.Group();
  const wood = woodMat('#8a6a42', { scale: 3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), wood));
  const slat = woodMat('#6a4c2c', { scale: 3 });
  for (const s of [-1, 1]) {
    for (const [x, y, w, h] of [[0, 0.75, 1.75, 0.22], [0, -0.75, 1.75, 0.22], [0.75, 0, 0.22, 1.75], [-0.75, 0, 0.22, 1.75]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), slat);
      b.position.set(x, y, s * 0.88);
      g.add(b);
    }
    const diag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.08), slat);
    diag.rotation.z = Math.PI / 4; diag.position.z = s * 0.9;
    g.add(diag);
  }
  const stencil = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.35), new THREE.MeshStandardMaterial({ color: '#2a1a10', transparent: true, opacity: 0.6 }));
  stencil.position.set(0, 0.3, 0.93);
  g.add(stencil);
  return { root: g, radius: 1.0, density: 0.7, mass: 2 };
}

const MAKERS = { barrel: barrelModel, buoy: buoyModel, log: logModel, crate: crateModel };

/** A rigid-ish floating body: circle collider with buoyancy, drag, wave drift and spin. */
export class Floater {
  constructor(w, kind, th) {
    const m = MAKERS[kind]();
    Object.assign(this, m, { w, kind });
    this.pos = w.globalXY(th, w.R + 1);
    this.vel = new THREE.Vector2();
    this.ang = th - Math.PI / 2;
    this.spin = 0;
    this.subm = 0.5;
    this.root.position.set(this.pos.x, this.pos.y, rand(-3, 3));
    this.z = this.root.position.z;
    this.bob = rand(0, TAU);
    this.splashCd = 0;
  }

  step(dt, sub, game, others) {
    const w = this.w, p = this.pos, v = this.vel;
    const [th, r] = w.polar(p.x, p.y);
    const ux = Math.cos(th), uy = Math.sin(th), tx = -uy, ty = ux;
    const surf = w.surface(th);
    const R = this.radius;
    const subm = clamp((surf - r + R) / (2 * R), 0, 1);
    const g = w.gravMag(r);
    let ax = -ux * g + (ux * g * subm) / this.density, ay = -uy * g + (uy * g * subm) / this.density;
    const sp = v.length();
    const lin = 0.9 * subm + 0.02, quad = 0.25 * subm;
    ax -= v.x * (lin + quad * sp); ay -= v.y * (lin + quad * sp);
    if (subm > 0.02 && subm < 0.98) {
      // Slide down wave faces and get carried by the splash sim's orbital motion.
      const sl = w.slope(th) * g * 1.6;
      ax -= tx * sl; ay -= ty * sl;
      const wa = w.weather.windAccel * 0.35;
      ax += tx * wa; ay += ty * wa;
    }
    v.x += ax * dt; v.y += ay * dt;
    p.x += v.x * dt; p.y += v.y * dt;

    // Terrain.
    for (let it = 0; it < 3; it++) {
      const [th2, r2] = w.polar(p.x, p.y);
      const gr = w.ground(th2);
      if (r2 >= gr + R) break;
      const n = w.groundNormal(th2, tmpN);
      const pen = gr + R - r2;
      p.x += n.x * pen; p.y += n.y * pen;
      const vn = v.x * n.x + v.y * n.y;
      if (vn < 0) { v.x -= 1.3 * vn * n.x; v.y -= 1.3 * vn * n.y; this.spin += (v.x * -n.y + v.y * n.x) * 0.3; }
    }
    // Ice keeps floaters on top or below.
    if (w.ice.length && w.inIce(th)) {
      const lo = w.R - 1.5 - R, hi = w.R + 1.1 + R;
      if (r > lo && r < hi) {
        const below = r < (lo + hi) / 2, tr = below ? lo : hi;
        p.x += ux * (tr - r); p.y += uy * (tr - r);
        const vr = v.x * ux + v.y * uy;
        if ((below && vr > 0) || (!below && vr < 0)) { v.x -= 1.2 * vr * ux; v.y -= 1.2 * vr * uy; }
      }
    }
    // The sub shoves us (and gets shoved back a little).
    const dx = p.x - sub.pos.x, dy = p.y - sub.pos.y, d = Math.hypot(dx, dy), minD = R + 1.15;
    if (d < minD && d > 0.001) {
      const nx = dx / d, ny = dy / d, pen = minD - d, ms = 3;
      p.x += nx * pen * (ms / (ms + this.mass)); p.y += ny * pen * (ms / (ms + this.mass));
      sub.pos.x -= nx * pen * (this.mass / (ms + this.mass)); sub.pos.y -= ny * pen * (this.mass / (ms + this.mass));
      const rv = (v.x - sub.vel.x) * nx + (v.y - sub.vel.y) * ny;
      if (rv < 0) {
        const j = (-(1.4) * rv) / (1 / this.mass + 1 / ms);
        v.x += (j / this.mass) * nx; v.y += (j / this.mass) * ny;
        sub.vel.x -= (j / ms) * nx; sub.vel.y -= (j / ms) * ny;
        this.spin += ((sub.vel.x * -ny + sub.vel.y * nx) * 0.25) / this.mass;
        if (-rv > 4) { game.sound.bonk(-rv * 0.7); if (this.kind === 'buoy') game.sound.tone(880, 1.4, { type: 'sine', vol: 0.08, verb: 0.6 }); }
      }
    }
    // Each other.
    for (const o of others) {
      if (o === this) continue;
      const ex = p.x - o.pos.x, ey = p.y - o.pos.y, ed = Math.hypot(ex, ey), md = R + o.radius;
      if (ed < md && ed > 0.001) {
        const nx = ex / ed, ny = ey / ed, pen = (md - ed) / 2;
        p.x += nx * pen; p.y += ny * pen; o.pos.x -= nx * pen; o.pos.y -= ny * pen;
        const rv = (v.x - o.vel.x) * nx + (v.y - o.vel.y) * ny;
        if (rv < 0) { const j = (-1.3 * rv) / (1 / this.mass + 1 / o.mass); v.x += (j / this.mass) * nx; v.y += (j / this.mass) * ny; o.vel.x -= (j / o.mass) * nx; o.vel.y -= (j / o.mass) * ny; }
      }
    }
    // Surface crossings splash.
    this.splashCd -= dt;
    const vr = v.x * ux + v.y * uy;
    if (this.subm < 0.3 && subm >= 0.3 && vr < -4 && this.splashCd <= 0) {
      this.splashCd = 0.5;
      w.splash(th, vr * 0.25, 2);
      const sp2 = w.globalXY(th, surf);
      game.fx.splash(sp2.x, sp2.y, ux, uy, -vr * 0.6, w.def.pal.waterTop);
    }
    this.subm = subm;

    // Rotation: buoyant torque rights the body along the wave surface; spin decays in water.
    const surfAng = th - Math.PI / 2 + Math.atan(w.slope(th));
    const target = this.upright || this.long ? surfAng : this.ang;
    const k = subm > 0.05 ? (this.upright ? 9 : 4) : 0;
    this.spin += angDiff(this.ang, target) * k * dt;
    this.spin -= v.dot(new THREE.Vector2(tx, ty)) * 0.02 * subm * dt * (this.long ? 0 : 6) / R;
    this.spin *= Math.exp(-(subm > 0.05 ? 2.2 : 0.2) * dt);
    this.ang += this.spin * dt;
  }

  render(t) {
    this.root.position.set(this.pos.x, this.pos.y, this.z);
    this.root.rotation.set(0, 0, this.ang);
    if (this.glow) this.glow.material.opacity = Math.sin(t * 3 + this.bob) > 0.3 ? 0.9 : 0.15;
  }
}
