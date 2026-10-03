import * as THREE from 'three';
import { damp, rand, smoothstep } from './util.js';

/**
 * Each world has its own weather that cycles calm → building → storm → clearing.
 * `storm` (0..1) drives swell height, wind, rain, cloud cover, lightning, audio and music.
 */
export class Weather {
  constructor(def) {
    const w = def.weather || {};
    this.base = w.base ?? 0.12;
    this.max = w.max ?? 0.85;
    this.storm = this.base;
    this.target = this.base;
    this.phase = 'calm';
    this.timer = rand(w.firstCalm ?? 40, (w.firstCalm ?? 40) + 40);
    this.wind = Math.random() < 0.5 ? 1 : -1;
    this.gust = 0;
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.phase === 'calm') { this.phase = 'storm'; this.target = this.max * rand(0.7, 1); this.timer = rand(45, 75); }
      else { this.phase = 'calm'; this.target = this.base * rand(0.5, 1.6); this.timer = rand(60, 110); if (Math.random() < 0.4) this.wind *= -1; }
    }
    this.storm = damp(this.storm, this.target, 0.06, dt);
    this.gust = damp(this.gust, Math.random() < 0.02 ? rand(0.5, 1.5) : 0.6, 0.8, dt);
  }
  get rain() { return smoothstep(0.35, 0.7, this.storm); }
  /** Tangential wind acceleration at the surface. */
  get windAccel() { return this.wind * (1.5 + 9 * this.storm) * this.gust; }
}

/** Rain streaks falling toward the core of the current world, in a box around the camera. */
export class Rain {
  constructor(scene, n = 900) {
    this.n = n;
    this.pos = new Float32Array(n * 6);
    this.p = new Float32Array(n * 3); // x, y, z of each drop head
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xc8d6e0, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 12;
    scene.add(this.lines);
    this.init = false;
  }
  update(dt, w, cx, cy, half, fx) {
    const amt = w.weather.rain;
    this.mat.opacity = amt * 0.55;
    this.lines.visible = amt > 0.01;
    if (!this.lines.visible) { this.init = false; return; }
    const wind = w.weather.windAccel;
    for (let i = 0; i < this.n; i++) {
      let x = this.p[i * 3], y = this.p[i * 3 + 1];
      const dx = x - w.c.x, dy = y - w.c.y, r = Math.hypot(dx, dy) || 1;
      const ux = dx / r, uy = dy / r;
      const out = Math.abs(x - cx) > half || Math.abs(y - cy) > half;
      if (!this.init || out || r < w.surface(Math.atan2(dy, dx)) || i / this.n > amt + 0.05) {
        if (this.init && !out && r < w.R + 2 && Math.random() < 0.03) fx.spawn({ x, y, vx: ux * 3, vy: uy * 3, ax: -ux * 14, ay: -uy * 14, life: 0.3, size: 0.25, color: 0xdfe8ee, alpha: 0.6 });
        x = cx + rand(-half, half); y = cy + rand(-half, half);
        const nth = Math.atan2(y - w.c.y, x - w.c.x), nr = Math.hypot(x - w.c.x, y - w.c.y), s = w.surface(nth) + 0.5;
        if (nr < s) { const rr = s + rand(0, half); x = w.c.x + Math.cos(nth) * rr; y = w.c.y + Math.sin(nth) * rr; }
        this.p[i * 3 + 2] = rand(-30, 8);
      }
      const sp = 55, tx = -uy * wind * 1.4, ty = ux * wind * 1.4;
      x += (-ux * sp + tx) * dt; y += (-uy * sp + ty) * dt;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y;
      const z = this.p[i * 3 + 2], L = 1.6;
      const dry = Math.hypot(x - w.c.x, y - w.c.y) > w.surface(Math.atan2(y - w.c.y, x - w.c.x));
      if (!dry) { this.pos.fill(0, i * 6, i * 6 + 6); continue; }
      this.pos.set([x, y, z, x + (ux * sp - tx) * 0.028 * L, y + (uy * sp - ty) * 0.028 * L, z], i * 6);
    }
    this.init = true;
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

/** A jagged lightning bolt from the cloud deck to the sea. */
export class Lightning {
  constructor(scene) {
    const n = 14;
    this.g = new THREE.BufferGeometry();
    this.g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xf2f0ff, transparent: true, opacity: 0, fog: false });
    this.line = new THREE.LineSegments(this.g, this.mat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 13;
    scene.add(this.line);
    this.n = n;
    this.flash = 0;
    this.timer = rand(3, 8);
  }
  strike(w, th) {
    const a = this.g.attributes.position.array;
    let px = w.c.x + Math.cos(th) * (w.R + 38), py = w.c.y + Math.sin(th) * (w.R + 38);
    const tx = w.c.x + Math.cos(th) * w.R, ty = w.c.y + Math.sin(th) * w.R;
    for (let i = 0; i < this.n; i++) {
      const f = (i + 1) / this.n;
      const nx = px + (tx - px) / (this.n - i) + rand(-2.5, 2.5) * (1 - f), ny = py + (ty - py) / (this.n - i) + rand(-2.5, 2.5) * (1 - f);
      a.set([px, py, -8, nx, ny, -8], i * 6);
      px = nx; py = ny;
    }
    this.g.attributes.position.needsUpdate = true;
    this.flash = 1;
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.mat.opacity = this.flash > 0.5 ? 1 : this.flash * 1.5 * (Math.random() < 0.5 ? 1 : 0.3);
  }
}
