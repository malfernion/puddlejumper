import * as THREE from 'three';
import { rand } from './util.js';

/** One pooled point-sprite system for bubbles, spray, flame and sparkles. */
export class FX {
  constructor(scene, cap = 2400) {
    this.cap = cap;
    this.head = 0;
    const f = (n) => new Float32Array(cap * n);
    Object.assign(this, {
      x: f(1), y: f(1), z: f(1), vx: f(1), vy: f(1), ax: f(1), ay: f(1), drag: f(1),
      life: f(1), max: f(1), s0: f(1), s1: f(1), cr: f(1), cg: f(1), cb: f(1), a0: f(1),
    });
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        uniform float uScale; attribute vec4 pcol; attribute float psize; varying vec4 vC;
        void main(){ vC = pcol; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = psize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying vec4 vC;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.36, r);
          float hl = smoothstep(0.18, 0.0, length(d - vec2(-0.15, -0.15)));
          gl_FragColor = vec4(mix(vC.rgb, vec3(1.0), hl*0.6), vC.a * a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }

  spawn(o) {
    const i = this.head; this.head = (this.head + 1) % this.cap;
    this.x[i] = o.x; this.y[i] = o.y; this.z[i] = o.z ?? rand(-1, 1.5);
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.ax[i] = o.ax || 0; this.ay[i] = o.ay || 0;
    this.drag[i] = o.drag ?? 0.5; this.life[i] = this.max[i] = o.life ?? 1;
    this.s0[i] = o.size ?? 0.5; this.s1[i] = o.size1 ?? this.s0[i];
    const c = this.tmp.set(o.color ?? 0xffffff);
    this.cr[i] = c.r; this.cg[i] = c.g; this.cb[i] = c.b; this.a0[i] = o.alpha ?? 1;
  }

  bubbles(x, y, ux, uy, n = 1, spread = 0.6) {
    for (let k = 0; k < n; k++) {
      this.spawn({ x: x + rand(-spread, spread), y: y + rand(-spread, spread), z: rand(-1.5, 2.5), vx: ux * rand(0, 1) + rand(-0.6, 0.6), vy: uy * rand(0, 1) + rand(-0.6, 0.6),
        ax: ux * 5, ay: uy * 5, drag: 1.6, life: rand(0.8, 1.8), size: rand(0.18, 0.45), color: 0xe9fdff, alpha: 0.75 });
    }
  }
  splash(x, y, ux, uy, power, color = 0xffffff) {
    const n = Math.min(80, Math.floor(power * 3));
    const tx = -uy, ty = ux;
    for (let k = 0; k < n; k++) {
      const up = rand(0.35, 1.0) * power * 0.85, side = rand(-1, 1) * power * 0.45;
      this.spawn({ x: x + tx * rand(-1, 1), y: y + ty * rand(-1, 1), z: rand(-3, 4), vx: ux * up + tx * side, vy: uy * up + ty * side,
        ax: -ux * 16, ay: -uy * 16, drag: 0.4, life: rand(0.7, 1.4), size: rand(0.3, 0.8), size1: 0.15, color: k % 3 ? 0xffffff : color, alpha: 0.95 });
    }
  }
  flame(x, y, dx, dy, vx = 0, vy = 0) {
    for (let k = 0; k < 3; k++) {
      const sp = rand(8, 16);
      this.spawn({ x, y, z: rand(-0.3, 0.3), vx: vx + dx * sp + rand(-2, 2), vy: vy + dy * sp + rand(-2, 2), drag: 3, life: rand(0.2, 0.45),
        size: rand(0.7, 1.3), size1: 0.1, color: [0xfff3a0, 0xffb347, 0xff5e3a][k], alpha: 0.95 });
    }
  }
  sparkle(x, y, color = 0xfff6c8, n = 14, speed = 6) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
      this.spawn({ x, y, z: rand(-0.5, 2), vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.5, life: rand(0.5, 1), size: rand(0.25, 0.6), size1: 0, color, alpha: 1 });
    }
  }
  puff(x, y, color = 0xffffff, n = 6, size = 1.4) {
    for (let k = 0; k < n; k++) {
      this.spawn({ x: x + rand(-1, 1), y: y + rand(-1, 1), z: rand(-2, 2), vx: rand(-2, 2), vy: rand(-2, 2), drag: 2, life: rand(0.6, 1.2), size, size1: size * 2, color, alpha: 0.5 });
    }
  }

  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] = (this.vx[i] + this.ax[i] * dt) * d;
      this.vy[i] = (this.vy[i] + this.ay[i] * dt) * d;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      this.pos[i * 3] = this.x[i]; this.pos[i * 3 + 1] = this.y[i]; this.pos[i * 3 + 2] = this.z[i];
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * t;
      this.col[i * 4] = this.cr[i]; this.col[i * 4 + 1] = this.cg[i]; this.col[i * 4 + 2] = this.cb[i];
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 3);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.pcol.needsUpdate = true;
    g.attributes.psize.needsUpdate = true;
  }
}
