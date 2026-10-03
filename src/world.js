import * as THREE from 'three';
import { TAU, mulberry32, clamp, lerp, angDiff, wrapAngle, smoothstep } from './util.js';
import { toon } from './toon.js';

// Depth layers of the diorama (the play plane is z = 0).
export const Z = { front: 6, back: -16, far: -28, water: -40, glass: 8, halo: -46 };

const TERR_N = 2048; // terrain lookup resolution
const SEG = 360; // visual angular segments
const WAVE_N = 360; // wave simulation columns

const C = (hex) => new THREE.Color(hex);

/** Build a polar grid mesh: rows x (seg+1) vertices, radius & colour per vertex. */
function polarGrid(rows, z, radiusFn, colorFn, alpha = false) {
  const cols = SEG + 1, n = rows * cols, cs = alpha ? 4 : 3;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * cs);
  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < cols; i++) {
      const th = (i / SEG) * TAU, r = radiusFn(th, k), j = k * cols + i;
      pos[j * 3] = Math.cos(th) * r; pos[j * 3 + 1] = Math.sin(th) * r; pos[j * 3 + 2] = z;
      const c = colorFn(th, k, r);
      for (let q = 0; q < cs; q++) col[j * cs + q] = c[q];
    }
  }
  const idx = [];
  for (let k = 0; k < rows - 1; k++) {
    for (let i = 0; i < SEG; i++) {
      const a = k * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, cs));
  g.setIndex(idx);
  return g;
}

export class World {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.R = def.R; this.g = def.g; this.A = def.atmo; this.F = def.falloff;
    this.c = new THREE.Vector2(def.pos[0], def.pos[1]);
    this.pal = {};
    for (const k in def.pal) this.pal[k] = Array.isArray(def.pal[k]) ? def.pal[k].map(C) : C(def.pal[k]);
    this.rng = mulberry32(def.seed);
    this.t = 0;
    this.ice = def.ice || [];
    this.waveH = new Float32Array(WAVE_N);
    this.waveV = new Float32Array(WAVE_N);
    this.surf = new Float32Array(SEG + 1);
    this.light = 1;
    this.creatures = [];
    this.things = []; // pickups, structures with update()
    this.buildTerrainTable();
    this.group = new THREE.Group();
    this.group.position.set(this.c.x, this.c.y, 0);
    this.buildMeshes();
  }

  get influence() { return this.R + this.A + this.F; }

  // ---------- shape ----------
  buildTerrainTable() {
    const d = this.def, R = this.R, rng = this.rng;
    const base = R * d.bed;
    const harm = [];
    for (let k = 1; k <= 22; k++) {
      harm.push({ k: k + (k > 3 ? Math.floor(rng() * 4) : 0), a: (R * d.rough * (0.4 + rng() * 0.6)) / Math.pow(k, 0.75), p: rng() * TAU });
    }
    this.terr = new Float32Array(TERR_N + 1);
    for (let i = 0; i <= TERR_N; i++) {
      const th = (i / TERR_N) * TAU;
      let h = base;
      for (const q of harm) h += q.a * Math.sin(q.k * th + q.p);
      h = clamp(h, R * 0.3, R - 7);
      for (const f of d.features) {
        const x = Math.abs(angDiff(f.at, th)) / f.w;
        let s, target;
        if (f.type === 'wall') { s = Math.exp(-Math.pow(x, 6)); target = R + f.h; }
        else if (f.type === 'island') { s = Math.exp(-Math.pow(x, 3)); target = R + f.h; }
        else if (f.type === 'shelf') { s = Math.exp(-Math.pow(x, 4)); target = R - f.depth; }
        else { s = Math.exp(-x * x * 1.6); target = R - f.depth; }
        h = lerp(h, target, s);
      }
      this.terr[i] = h;
    }
    // A second, softer silhouette for the far background reef.
    this.far = new Float32Array(TERR_N + 1);
    for (let i = 0; i <= TERR_N; i++) {
      const th = (i / TERR_N) * TAU;
      let h = base + R * 0.08;
      for (let j = 0; j < 6; j++) h += harm[j].a * 1.6 * Math.sin(harm[j].k * th + harm[j].p * 2.1 + 1);
      this.far[i] = Math.min(h, R - 4);
    }
  }

  ground(th) {
    const x = (wrapAngle(th) / TAU) * TERR_N, i = Math.floor(x), f = x - i;
    return this.terr[i] * (1 - f) + this.terr[i + 1] * f;
  }
  farGround(th) {
    const x = (wrapAngle(th) / TAU) * TERR_N, i = Math.floor(x), f = x - i;
    return this.far[i] * (1 - f) + this.far[i + 1] * f;
  }
  /** Outward surface normal of the seabed at angle th (local). */
  groundNormal(th, out) {
    const e = 0.004, r0 = this.ground(th - e), r1 = this.ground(th + e);
    const x0 = Math.cos(th - e) * r0, y0 = Math.sin(th - e) * r0;
    const x1 = Math.cos(th + e) * r1, y1 = Math.sin(th + e) * r1;
    const tx = x1 - x0, ty = y1 - y0, l = Math.hypot(tx, ty) || 1;
    return out.set(ty / l, -tx / l);
  }
  inIce(th) {
    const a = wrapAngle(th);
    for (const [a0, a1] of this.ice) if (a >= a0 && a <= a1) return true;
    return false;
  }

  // ---------- water ----------
  ambient(th) {
    const t = this.t, s = this.def.swell;
    return s * (0.6 * Math.sin(5 * th + 1.1 * t) + 0.3 * Math.sin(11 * th - 1.7 * t + 1) + 0.18 * Math.sin(23 * th + 2.6 * t + 2));
  }
  waveAt(th) {
    const x = (wrapAngle(th) / TAU) * WAVE_N, i0 = Math.floor(x), f = x - i0;
    const i = i0 % WAVE_N, j = (i + 1) % WAVE_N;
    return this.waveH[i] * (1 - f) + this.waveH[j] * f;
  }
  surface(th) {
    if (this.ice.length && this.inIce(th)) return this.R;
    return this.R + this.ambient(th) + this.waveAt(th);
  }
  /** Kick the wave surface (positive = upward). */
  splash(th, imp, spread = 3) {
    if (this.ice.length && this.inIce(th)) return;
    const c = Math.round((wrapAngle(th) / TAU) * WAVE_N);
    for (let o = -spread * 2; o <= spread * 2; o++) {
      const k = (((c + o) % WAVE_N) + WAVE_N) % WAVE_N;
      this.waveV[k] += imp * Math.exp(-(o * o) / (spread * spread));
    }
  }
  stepWaves(dt) {
    const N = WAVE_N, h = this.waveH, v = this.waveV;
    const dx = (TAU * this.R) / N, c2 = 14 * 14 / (dx * dx), k = 1.6, damp = 1.1;
    const steps = 3, s = Math.min(dt, 0.05) / steps;
    for (let n = 0; n < steps; n++) {
      for (let i = 0; i < N; i++) {
        const l = h[i === 0 ? N - 1 : i - 1], r = h[i === N - 1 ? 0 : i + 1];
        v[i] += (c2 * (l + r - 2 * h[i]) - k * h[i] - damp * v[i]) * s;
      }
      for (let i = 0; i < N; i++) h[i] = clamp(h[i] + v[i] * s, -6, 6);
    }
  }

  // ---------- gravity ----------
  gravMag(r) {
    const edge = this.R + this.A;
    if (r <= edge) return this.g;
    if (r >= edge + this.F) return 0;
    return this.g * (1 - (r - edge) / this.F);
  }

  local(th, r, out = new THREE.Vector3()) { return out.set(Math.cos(th) * r, Math.sin(th) * r, 0); }
  globalXY(th, r, out = new THREE.Vector2()) { return out.set(this.c.x + Math.cos(th) * r, this.c.y + Math.sin(th) * r); }
  polar(x, y) { const dx = x - this.c.x, dy = y - this.c.y; return [Math.atan2(dy, dx), Math.hypot(dx, dy)]; }

  /** Place an object on the world: local +y points radially outward. */
  place(obj, th, r, z = 0) {
    obj.position.set(Math.cos(th) * r, Math.sin(th) * r, z);
    obj.rotation.z = th - Math.PI / 2;
    return obj;
  }

  // ---------- meshes ----------
  depthTint(color, r, amt = 0.6) {
    const t = clamp((this.R - r) / (this.R * 0.62), 0, 1);
    return color.clone().lerp(this.pal.abyss, t * amt);
  }

  buildMeshes() {
    const P = this.pal, R = this.R;
    // Terrain front cap: concentric strata cut-away down to the core.
    const inner = [0, 0.16, 0.3, 0.42, 0.53, 0.63, 0.72, 0.8, 0.87, 0.93, 1];
    const rows = inner.length + 3;
    const radiusAt = (th, k) => {
      const g = this.ground(th);
      if (k < inner.length) return inner[k] * (g - 4.2);
      return g - [2.4, 1.0, 0][k - inner.length];
    };
    const capColor = (th, k, r) => {
      const g = this.ground(th), above = g > R - 0.3;
      let c;
      if (k <= 1) c = P.core.clone();
      else if (k < inner.length) c = (k % 2 ? P.rock : P.rock2).clone().multiplyScalar(0.55 + 0.45 * (k / inner.length));
      else if (k === inner.length) c = (above ? P.grass : P.sand).clone().multiplyScalar(0.75);
      else c = (above ? P.grass : P.sand).clone();
      if (k > 1) c = this.depthTint(c, r, 0.45);
      return [c.r, c.g, c.b];
    };
    const cap = new THREE.Mesh(polarGrid(rows, Z.front, radiusAt, capColor), toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
    cap.geometry.computeVertexNormals();
    // Flat-face normals toward the camera keep the cut-away evenly lit.
    const nrm = cap.geometry.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 0, 1);
    this.group.add(cap);

    // Terrain side wall: the seabed surface receding into the screen.
    const zs = [Z.front, Z.front - 1.2, Z.front - 6, Z.back];
    const cols = SEG + 1;
    const wpos = new Float32Array(zs.length * cols * 3), wcol = new Float32Array(zs.length * cols * 3);
    for (let k = 0; k < zs.length; k++) {
      for (let i = 0; i < cols; i++) {
        const th = (i / SEG) * TAU, r = this.ground(th), j = k * cols + i;
        wpos.set([Math.cos(th) * r, Math.sin(th) * r, zs[k]], j * 3);
        const above = r > R - 0.3;
        let c = (above ? P.grass : P.sand).clone();
        if (k === 0) c.multiplyScalar(1.12);
        if (k === 3) c.multiplyScalar(0.8);
        c = this.depthTint(c, r);
        wcol.set([c.r, c.g, c.b], j * 3);
      }
    }
    const widx = [];
    for (let k = 0; k < zs.length - 1; k++) {
      for (let i = 0; i < SEG; i++) {
        const a = k * cols + i, b = a + 1, c = a + cols, d = c + 1;
        widx.push(a, b, d, a, d, c);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
    wg.setIndex(widx);
    wg.computeVertexNormals();
    this.group.add(new THREE.Mesh(wg, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide })));

    // Core glow.
    const coreR = Math.min(...Array.from({ length: 64 }, (_, i) => this.ground((i / 64) * TAU))) * 0.13;
    this.core = new THREE.Mesh(new THREE.CircleGeometry(coreR, 48), new THREE.MeshBasicMaterial({ color: P.core }));
    this.core.position.z = Z.front + 0.05;
    this.group.add(this.core);

    // Far reef silhouette.
    const farMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const far = new THREE.Mesh(polarGrid(2, Z.far, (th, k) => (k ? this.farGround(th) : 0), (th, k, r) => {
      const c = P.far.clone().lerp(P.abyss, k ? clamp((R - r) / (R * 0.7), 0, 1) * 0.7 : 0.8);
      return [c.r, c.g, c.b];
    }), farMat);
    this.group.add(far);

    // Water: opaque back disc, translucent front glass, surface ribbon and foam.
    this.wFr = [0, 0.3, 0.55, 0.75, 0.88, 0.96, 1];
    const waterCol = (th, k) => {
      const f = this.wFr[k];
      const c = f < 0.55 ? P.abyss.clone().lerp(P.waterDeep, f / 0.55) : P.waterDeep.clone().lerp(P.waterTop, (f - 0.55) / 0.45);
      return [c.r, c.g, c.b];
    };
    const wr = (th, k) => this.wFr[k] * R;
    this.backMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.back = new THREE.Mesh(polarGrid(this.wFr.length, Z.water, wr, waterCol), this.backMat);
    this.glass = new THREE.Mesh(polarGrid(this.wFr.length, Z.glass, wr, waterCol), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false,
    }));
    this.glass.renderOrder = 10;

    const rib = new THREE.BufferGeometry();
    rib.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3));
    const ridx = [];
    for (let i = 0; i < SEG; i++) { const a = i, b = i + 1, c = i + cols, d = c + 1; ridx.push(a, b, d, a, d, c); }
    rib.setIndex(ridx);
    this.ribbon = new THREE.Mesh(rib, new THREE.MeshBasicMaterial({
      color: P.waterTop.clone().lerp(new THREE.Color('#ffffff'), 0.35), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.ribbon.renderOrder = 9;
    this.foam = new THREE.Mesh(polarGrid(2, Z.glass + 0.05, (th, k) => R + (k ? 0.15 : -0.5), () => [1, 1, 1]), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.foam.renderOrder = 11;
    for (const m of [this.back, this.glass, this.ribbon, this.foam]) { m.frustumCulled = false; this.group.add(m); }

    // Atmosphere halo.
    const haloR = [R - 4, R + this.A * 0.5, R + this.A, R + this.A + this.F * 0.35, R + this.A + this.F * 0.75];
    const haloA = [0.95, 0.8, 0.5, 0.18, 0];
    const halo = new THREE.Mesh(polarGrid(5, Z.halo, (th, k) => haloR[k], (th, k) => [P.sky.r, P.sky.g, P.sky.b, haloA[k]], true), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
    }));
    halo.renderOrder = -1;
    this.group.add(halo);

    this.buildIce();
    this.buildClouds();
    this.buildKelp();
    this.buildCoral();
  }

  buildIce() {
    if (!this.ice.length) return;
    const mat = toon('#e9fbff');
    const top = toon('#ffffff');
    for (const [a0, a1] of this.ice) {
      const sh = new THREE.Shape();
      const ro = this.R + 1.1, ri = this.R - 1.5;
      sh.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
      sh.absarc(0, 0, ro, a0, a1, false);
      sh.absarc(0, 0, ri, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(sh, { depth: Z.glass - Z.water + 1, bevelEnabled: false, curveSegments: Math.ceil((a1 - a0) * 60) });
      const m = new THREE.Mesh(g, [top, mat]);
      m.position.z = Z.water;
      this.group.add(m);
      // Snow lumps on top.
      for (let a = a0 + 0.03; a < a1 - 0.02; a += 0.05 + this.rng() * 0.06) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), top);
        s.scale.set(1.5 + this.rng() * 2, 0.6 + this.rng() * 0.8, 1.5 + this.rng() * 2);
        this.place(s, a, this.R + 1.1, -30 + this.rng() * 34);
        this.group.add(s);
      }
    }
  }

  buildClouds() {
    this.clouds = [];
    const mat = toon('#ffffff');
    const n = 7;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const parts = 3 + Math.floor(this.rng() * 3);
      for (let j = 0; j < parts; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
        const r = 2 + this.rng() * 2.5;
        s.scale.set(r, r * 0.8, r);
        s.position.set((j - parts / 2) * 2.6, this.rng() * 1.4, this.rng() * 2);
        g.add(s);
      }
      g.userData = { th: this.rng() * TAU, r: this.R + 14 + this.rng() * 14, w: (this.rng() - 0.5) * 0.02 };
      g.position.z = -34 + this.rng() * 26;
      this.clouds.push(g);
      this.group.add(g);
    }
  }

  buildKelp() {
    const n = this.def.kelp || 30, R = this.R, rng = this.rng;
    const pos = [], col = [], sway = [], phase = [], tang = [], idx = [];
    let v = 0;
    for (let q = 0; q < n; q++) {
      const th = rng() * TAU, g = this.ground(th);
      if (g > R - 8 || (this.ice.length && this.inIce(th) && rng() < 0.5)) continue;
      const z = -14 + rng() * 17, h = Math.min(5 + rng() * 14, R - g - 3), segs = 9, w = 0.5 + rng() * 0.6;
      const ux = Math.cos(th), uy = Math.sin(th), tx = -uy, ty = ux, ph = rng() * TAU;
      const base = this.pal.kelp.clone().offsetHSL((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.15);
      for (let s = 0; s <= segs; s++) {
        const f = s / segs, r = g - 0.4 + f * h, ww = w * (1 - f * 0.7) * (1 + 0.3 * Math.sin(f * 9 + ph));
        for (const side of [-1, 1]) {
          pos.push(ux * r + tx * ww * side, uy * r + ty * ww * side, z);
          const c = this.depthTint(base, r, 0.5).multiplyScalar(0.7 + f * 0.5);
          col.push(c.r, c.g, c.b);
          sway.push(Math.pow(f, 1.4)); phase.push(ph); tang.push(tx, ty);
        }
        if (s < segs) { const a = v + s * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      }
      v += (segs + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('kcol', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
    g.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
    g.setAttribute('tang', new THREE.Float32BufferAttribute(tang, 2));
    g.setIndex(idx);
    this.kelpMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLight: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        uniform float uTime; attribute vec3 kcol; attribute float sway; attribute float phase; attribute vec2 tang;
        varying vec3 vC;
        void main(){
          vec3 p = position;
          float s = sin(uTime*1.3 + phase + sway*2.5) * sway * 1.8 + sin(uTime*0.6 + phase)*sway*0.8;
          p.xy += tang * s;
          vC = kcol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uLight; varying vec3 vC;
        void main(){ gl_FragColor = vec4(vC * uLight, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(g, this.kelpMat);
    m.frustumCulled = false;
    this.group.add(m);
  }

  buildCoral() {
    const n = this.def.coral || 60, R = this.R, rng = this.rng;
    const shapes = [
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.ConeGeometry(0.7, 2.6, 8),
      new THREE.CylinderGeometry(0.35, 0.5, 2.4, 8),
      new THREE.DodecahedronGeometry(1.2, 0),
    ];
    const per = shapes.map(() => []);
    for (let i = 0; i < n; i++) {
      const th = rng() * TAU, g = this.ground(th);
      if (g > R - 3) continue;
      const kind = Math.floor(rng() * shapes.length);
      per[kind].push({ th, g, z: -14 + rng() * 19, s: 0.6 + rng() * 1.5, c: kind === 3 ? this.pal.rock2 : this.pal.coral[Math.floor(rng() * this.pal.coral.length)] });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    shapes.forEach((geo, k) => {
      const list = per[k];
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, toon(0xffffff), list.length);
      list.forEach((it, i) => {
        const sink = k === 0 ? 0.3 : k === 3 ? 0.5 : -1.0;
        p.set(Math.cos(it.th) * (it.g - sink * it.s * 0.5), Math.sin(it.th) * (it.g - sink * it.s * 0.5), it.z);
        e.set((rng() - 0.5) * 0.4, rng() * TAU, it.th - Math.PI / 2 + (rng() - 0.5) * 0.4);
        q.setFromEuler(e);
        s.set(it.s, it.s * (k === 0 ? 0.7 : 1), it.s);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
        im.setColorAt(i, this.depthTint(it.c, it.g, 0.5));
      });
      im.frustumCulled = false;
      this.group.add(im);
    });
  }

  // ---------- per-frame ----------
  update(dt, simulate, visible, light) {
    this.t += dt;
    if (simulate) this.stepWaves(dt);
    this.kelpMat.uniforms.uTime.value = this.t;
    this.kelpMat.uniforms.uLight.value = 0.35 + 0.65 * light;
    this.backMat.color.setScalar(0.3 + 0.7 * light);
    this.core.scale.setScalar(1 + 0.06 * Math.sin(this.t * 2));
    for (const cl of this.clouds) {
      cl.userData.th += cl.userData.w * dt;
      this.place(cl, cl.userData.th, cl.userData.r + Math.sin(this.t * 0.3 + cl.userData.r) * 1.5, cl.position.z);
    }
    if (!visible) return;
    for (let i = 0; i <= SEG; i++) this.surf[i] = this.surface((i / SEG) * TAU);
    const cols = SEG + 1;
    for (const mesh of [this.back, this.glass]) {
      const a = mesh.geometry.attributes.position;
      for (let k = 0; k < this.wFr.length; k++) {
        const f = this.wFr[k];
        if (f < 0.85) continue; // inner rows are hidden behind the seabed
        for (let i = 0; i < cols; i++) {
          const th = (i / SEG) * TAU, r = f * this.surf[i] + (1 - f) * 0;
          a.setXY(k * cols + i, Math.cos(th) * r, Math.sin(th) * r);
        }
      }
      a.needsUpdate = true;
    }
    const rp = this.ribbon.geometry.attributes.position;
    const fp = this.foam.geometry.attributes.position;
    for (let i = 0; i < cols; i++) {
      const th = (i / SEG) * TAU, r = this.surf[i], cx = Math.cos(th), sy = Math.sin(th);
      rp.setXYZ(i, cx * r, sy * r, Z.water);
      rp.setXYZ(i + cols, cx * r, sy * r, Z.glass);
      fp.setXY(i, cx * (r - 0.5), sy * (r - 0.5));
      fp.setXY(i + cols, cx * (r + 0.15), sy * (r + 0.15));
    }
    rp.needsUpdate = true;
    fp.needsUpdate = true;
  }
}

export function smoothLight(depth, R) { return clamp(1 - smoothstep(0, R * 0.7, depth) * 0.9, 0.1, 1); }
