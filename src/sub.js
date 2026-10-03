import * as THREE from 'three';
import { clamp, angDiff, dampAngle } from './util.js';
import { stats } from './data/parts.js';
import { buildSub } from './subModel.js';
import { orientSide } from './toon.js';

const RAD = 1.15; // collision radius
const tmpN = new THREE.Vector2();
const tmpV = new THREE.Vector3();

export class Sub {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector2();
    this.vel = new THREE.Vector2();
    this.ext = new THREE.Vector2();
    this.angle = 0;
    this.rollSt = { roll: 0 };
    this.hull = 60;
    this.fuel = 0.7;
    this.lampOn = true;
    this.inv = 0;
    this.subm = 1;
    this.boosting = false;
    this.thrust = 0;
    this.env = null;
    this.bubbleT = 0;
    this.light = new THREE.PointLight(0xfff0c8, 0, 20, 1);
    scene.add(this.light);
  }

  equip(e) {
    const old = this.st;
    if (this.model) this.scene.remove(this.model.root);
    this.model = buildSub(e);
    this.scene.add(this.model.root);
    this.st = stats(e);
    this.hull = old ? clamp(this.hull + (this.st.hp - old.hp), 1, this.st.hp) : this.st.hp;
    this.fuel = Math.min(this.fuel, this.st.fuel);
    if (this.light.parent !== this.scene) this.scene.add(this.light);
  }

  /** The world whose gravity dominates here (or the nearest if we're in deep space). */
  locate(worlds) {
    let best = null;
    for (const w of worlds) {
      const [th, r] = w.polar(this.pos.x, this.pos.y);
      const gm = w.gravMag(r), d = r - w.influence;
      if (!best || gm > best.gm || (gm === 0 && best.gm === 0 && d < best.d)) best = { w, th, r, gm, d };
    }
    return best;
  }

  step(dt, input, worlds, game) {
    const st = this.st, p = this.pos, v = this.vel;
    const dom = this.locate(worlds);
    const { w, th, r } = dom;
    const ux = Math.cos(th), uy = Math.sin(th);
    let gx = 0, gy = 0;
    for (const o of worlds) {
      const [oth, orr] = o.polar(p.x, p.y);
      const gm = o.gravMag(orr);
      gx -= Math.cos(oth) * gm; gy -= Math.sin(oth) * gm;
    }
    const gmag = Math.hypot(gx, gy);
    const surf = w.surface(th);
    const depth = surf - r;
    const iced = w.ice.length && w.inIce(th);
    const subm = clamp((depth + 1.1) / 2.2, 0, 1);
    const space = r > w.R + w.A + 3;
    const inAtmo = !space && subm < 0.05;

    // Screen-relative steering → world direction.
    const cb = game.camBasis;
    const dx = cb.rx * input.x + cb.ux * input.y, dy = cb.ry * input.x + cb.uy * input.y;
    const dl = Math.hypot(dx, dy);
    let target = this.angle;
    if (dl > 0.1) {
      target = Math.atan2(dy, dx);
      const rate = st.turn * (subm > 0.3 ? 1 : 0.85);
      this.angle += clamp(angDiff(this.angle, target), -rate * dt, rate * dt);
    } else if (inAtmo && v.lengthSq() > 9) {
      this.angle = dampAngle(this.angle, Math.atan2(v.y, v.x), 2.2, dt);
    }
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);

    let ax = gx * (1 - subm), ay = gy * (1 - subm); // neutral buoyancy when submerged
    this.thrust = 0;
    if (dl > 0.1 && subm > 0) {
      const align = Math.max(0, Math.cos(angDiff(this.angle, target)));
      this.thrust = align * Math.min(1, dl);
      const ts = Math.sqrt(subm);
      ax += fx * st.thrust * this.thrust * ts;
      ay += fy * st.thrust * this.thrust * ts;
    }
    const sp = v.length();
    const s2 = subm * subm; // drag fades fast as we break the surface, so leaps keep their speed
    const lin = 0.6 * s2 + (inAtmo ? 0.04 : 0), quad = 0.13 * st.drag * s2;
    ax -= v.x * (lin + quad * sp);
    ay -= v.y * (lin + quad * sp);

    // Glide: wings convert sideways speed into lift while falling.
    if (inAtmo && st.glide > 0) {
      const vr = v.x * ux + v.y * uy, vt = Math.abs(-v.x * uy + v.y * ux);
      if (vr < 0) {
        const lift = clamp((st.glide * vt) / 20, 0, 0.8) * gmag;
        ax += ux * lift; ay += uy * lift;
        ax -= v.x * 0.05 * st.glide; ay -= v.y * 0.05 * st.glide;
      }
    }
    // Little RCS puffs out of the water so you're never totally helpless.
    if (subm < 0.05 && dl > 0.1) {
      const rcs = space ? (sp < 20 ? 2.5 : 1) : 1.5;
      ax += (dx / dl) * rcs; ay += (dy / dl) * rcs;
    }
    // Weather: wind shoves you around above water; at the surface you slide down wave faces.
    if (!space && subm < 0.95) {
      const wa = w.weather.windAccel * (1 - subm) * (r < w.R + w.A ? 1 : 0.3);
      ax += -uy * wa; ay += ux * wa;
    }
    if (subm > 0.05 && subm < 0.95 && !iced) {
      const sl = w.slope(th) * gmag * 2.2 * subm * (1 - subm) * 4;
      ax -= -uy * sl; ay -= ux * sl;
    }
    // Cartoon re-entry: thick air brakes a screaming fall into a world.
    if (inAtmo && sp > 26 && r < w.R + w.A && v.x * ux + v.y * uy < 0) {
      const k = (0.9 * (sp - 26)) / sp;
      ax -= v.x * k; ay -= v.y * k;
      if (Math.random() < 0.5) game.fx.spawn({ x: p.x + (Math.random() - 0.5), y: p.y + (Math.random() - 0.5), vx: -v.x * 0.2, vy: -v.y * 0.2, drag: 3, life: 0.4, size: 1.2, size1: 0.2, color: 0xffd27a, alpha: 0.9 });
    }
    this.boosting = false;
    if (input.boost && this.fuel > 0) {
      ax += fx * st.rocketThrust; ay += fy * st.rocketThrust;
      this.fuel = Math.max(0, this.fuel - dt);
      this.boosting = true;
    } else if (subm > 0.6) {
      this.fuel = Math.min(st.fuel, this.fuel + (dt * st.fuel) / 2.2);
    }
    ax += this.ext.x; ay += this.ext.y; // reset by the game once per frame

    v.x += ax * dt; v.y += ay * dt;
    p.x += v.x * dt; p.y += v.y * dt;

    this.collide(w, game);

    // Surface crossings: splash, waves, sound.
    const [th2, r2] = w.polar(p.x, p.y);
    const subm2 = clamp((w.surface(th2) - r2 + 1.1) / 2.2, 0, 1);
    const vr = v.x * Math.cos(th2) + v.y * Math.sin(th2);
    if (!iced && this.subm >= 0.5 && subm2 < 0.5 && vr > 2.5) {
      game.onSplash(w, th2, vr, false);
      // Dolphin kick: a committed, fast breach gets a little extra pop.
      if (vr > 8) v.multiplyScalar(1.06);
    }
    if (!iced && this.subm < 0.5 && subm2 >= 0.5 && vr < -2.5) game.onSplash(w, th2, -vr, true);
    if (subm2 > 0.15 && subm2 < 0.95 && sp > 2) w.splash(th2, -sp * 0.6 * dt, 2);
    this.subm = subm2;

    // Pressure.
    const below = w.R - r2;
    this.overDepth = below > st.depth ? below - st.depth : 0;
    if (this.overDepth > 0) game.damage(dt * (4 + this.overDepth * 0.4), 'pressure');

    // Bubble wake + rocket flame.
    const m = this.model;
    this.bubbleT -= dt;
    if (subm2 > 0.9 && this.thrust > 0.3 && this.bubbleT <= 0) {
      this.bubbleT = 0.05;
      const back = m.half + 0.6;
      game.fx.bubbles(p.x - fx * back, p.y - fy * back, Math.cos(th2), Math.sin(th2), 1, 0.4);
    }
    if (this.boosting) {
      m.nozzle.getWorldPosition(tmpV);
      if (subm2 > 0.5) game.fx.bubbles(tmpV.x, tmpV.y, -fx * 6, -fy * 6, 3, 0.3);
      else game.fx.flame(tmpV.x, tmpV.y, -fx, -fy, v.x * 0.5, v.y * 0.5);
    }

    this.inv = Math.max(0, this.inv - dt);
    this.env = { w, th: th2, r: r2, subm: subm2, space: r2 > w.R + w.A + 3, below, surf: w.surface(th2), gm: dom.gm };
  }

  collide(w, game) {
    const p = this.pos, v = this.vel;
    let hit = 0;
    for (let it = 0; it < 6; it++) {
      const [th, r] = w.polar(p.x, p.y);
      const gr = w.ground(th);
      if (r >= gr + RAD) break;
      const n = w.groundNormal(th, tmpN);
      const pen = gr + RAD - r;
      p.x += n.x * pen * 0.7 + Math.cos(th) * pen * 0.3;
      p.y += n.y * pen * 0.7 + Math.sin(th) * pen * 0.3;
      const vn = v.x * n.x + v.y * n.y;
      if (vn < 0) {
        v.x -= 1.35 * vn * n.x; v.y -= 1.35 * vn * n.y;
        v.multiplyScalar(0.94);
        hit = Math.max(hit, -vn);
      }
    }
    // Ice sheets float on the surface of Frostfloe.
    if (w.ice.length) {
      const [th, r] = w.polar(p.x, p.y);
      if (w.inIce(th)) {
        const lo = w.R - 1.5 - RAD, hi = w.R + 1.1 + RAD;
        if (r > lo && r < hi) {
          const fromBelow = r < (lo + hi) / 2;
          const nx = Math.cos(th) * (fromBelow ? -1 : 1), ny = Math.sin(th) * (fromBelow ? -1 : 1);
          const tr = fromBelow ? lo : hi;
          p.x += Math.cos(th) * (tr - r); p.y += Math.sin(th) * (tr - r);
          const vn = v.x * nx + v.y * ny;
          if (vn < 0) { v.x -= 1.4 * vn * nx; v.y -= 1.4 * vn * ny; hit = Math.max(hit, -vn); }
        }
      }
    }
    if (hit > 3) game.sound.bonk(hit);
    if (hit > 13) game.damage(Math.min(30, (hit - 13) * 1.6), 'bonk');
  }

  /** Visual sync; called every frame after physics. */
  render(dt, game, light) {
    const m = this.model, p = this.pos;
    m.root.position.set(p.x, p.y, 0);
    orientSide(m.root, this.angle, game.camBasis.rx, game.camBasis.ry, this.rollSt, dt, 6);
    const wob = this.env && this.env.subm > 0.9 ? Math.sin(performance.now() * 0.003) * 0.04 : 0;
    m.body.rotation.z = wob;
    for (const pr of m.props) pr.rotation.x += dt * (4 + this.thrust * 30);
    m.lampPos.getWorldPosition(tmpV);
    const dark = 1 - light;
    this.light.position.set(tmpV.x + Math.cos(this.angle) * 2, tmpV.y + Math.sin(this.angle) * 2, 5);
    this.light.distance = this.st.lampRange * 1.6;
    this.light.intensity = this.lampOn ? this.st.lampPower * (8 + 70 * dark) : 0;
    m.lampGlow.visible = this.lampOn;
    m.lampGlow.material.opacity = 0.5 + 0.4 * Math.sin(performance.now() * 0.01) * 0.3 + dark * 0.3;
    m.root.visible = !(this.inv > 0 && Math.floor(this.inv * 14) % 2 === 0);
  }

  get speed() { return this.vel.length(); }
}

export { RAD as SUB_RADIUS };
