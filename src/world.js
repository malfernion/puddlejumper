import * as THREE from 'three';
import { TAU, mulberry32, clamp, lerp, angDiff, wrapAngle, smoothstep } from './util.js';
import { toon, stone } from './toon.js';
import { Weather } from './weather.js';

// Depth layers of the diorama (the play plane is z = 0).
export const Z = { front: 6, back: -16, far: -28, water: -40, glass: 8, halo: -46 };

const TERR_N = 2048; // terrain lookup resolution
const SEG = 360; // terrain angular segments
const WSEG = 1440; // water surface segments (fine enough for small chop)
const WAVE_N = 720; // splash simulation columns

const C = (hex) => new THREE.Color(hex);

const NOISE = /* glsl */`
  float h3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n3(p); p=p*2.02+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

/** Build a polar grid mesh: rows x (seg+1) vertices, radius & colour per vertex. */
function polarGrid(rows, z, radiusFn, colorFn, alpha = false, seg = SEG) {
  const cols = seg + 1, n = rows * cols, cs = alpha ? 4 : 3;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * cs);
  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < cols; i++) {
      const th = (i / seg) * TAU, r = radiusFn(th, k), j = k * cols + i;
      pos[j * 3] = Math.cos(th) * r; pos[j * 3 + 1] = Math.sin(th) * r; pos[j * 3 + 2] = z;
      const c = colorFn(th, k, r);
      for (let q = 0; q < cs; q++) col[j * cs + q] = c[q];
    }
  }
  const idx = [];
  for (let k = 0; k < rows - 1; k++) {
    for (let i = 0; i < seg; i++) {
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
    this.weather = new Weather(def);
    this.waveH = new Float32Array(WAVE_N);
    this.waveV = new Float32Array(WAVE_N);
    this.surf = new Float32Array(WSEG + 1);
    this.light = 1;
    this.creatures = [];
    this.things = [];
    // Fractal swell: octaves of Stokes-like waves, wavenumbers k around the circumference.
    this.octaves = [];
    for (let i = 0; i < 11; i++) {
      const k = Math.round(4 * Math.pow(1.6, i)) + Math.floor(this.rng() * 3);
      this.octaves.push({ k, a: 0.95 * Math.pow(4 / k, 0.72), w: Math.sqrt((9.8 * k) / this.R) * 1.25, p: this.rng() * TAU, dir: this.rng() < 0.75 ? 1 : -1 });
    }
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
    for (let k = 1; k <= 40; k++) {
      harm.push({ k: k + (k > 3 ? Math.floor(rng() * 4) : 0), a: (R * d.rough * (0.4 + rng() * 0.6)) / Math.pow(k, 0.8), p: rng() * TAU });
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
    this.far = new Float32Array(TERR_N + 1);
    for (let i = 0; i <= TERR_N; i++) {
      const th = (i / TERR_N) * TAU;
      let h = base + R * 0.08;
      for (let j = 0; j < 8; j++) h += harm[j].a * 1.6 * Math.sin(harm[j].k * th + harm[j].p * 2.1 + 1);
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
  /** Swell height multiplier from the weather. */
  get seaState() { return this.def.swell * (0.45 + 2.4 * this.weather.storm); }
  ambient(th) {
    const t = this.t, s = this.seaState;
    let h = 0;
    for (const o of this.octaves) {
      const ph = o.k * th - o.w * t * o.dir * this.weather.wind + o.p;
      h += o.a * (Math.cos(ph) + 0.32 * Math.cos(2 * ph));
    }
    return h * s;
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
  /** Surface slope (d height / d arc length) for things drifting on waves. */
  slope(th) {
    const e = 0.006;
    return (this.surface(th + e) - this.surface(th - e)) / (2 * e * this.R);
  }
  splash(th, imp, spread = 3) {
    if (this.ice.length && this.inIce(th)) return;
    const c = Math.round((wrapAngle(th) / TAU) * WAVE_N);
    spread *= 2;
    for (let o = -spread * 2; o <= spread * 2; o++) {
      const k = (((c + o) % WAVE_N) + WAVE_N) % WAVE_N;
      this.waveV[k] += imp * Math.exp(-(o * o) / (spread * spread));
    }
  }
  stepWaves(dt) {
    const N = WAVE_N, h = this.waveH, v = this.waveV;
    const dx = (TAU * this.R) / N, c2 = (14 * 14) / (dx * dx), k = 1.6, damp = 1.1;
    const steps = 4, s = Math.min(dt, 0.05) / steps;
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
      else if (k < inner.length) c = (k % 2 ? P.rock : P.rock2).clone().multiplyScalar(0.5 + 0.5 * (k / inner.length));
      else if (k === inner.length) c = (above ? P.grass : P.sand).clone().multiplyScalar(0.7);
      else c = (above ? P.grass : P.sand).clone();
      if (k > 1) c = this.depthTint(c, r, 0.5);
      return [c.r, c.g, c.b];
    };
    const capMat = stone(0xffffff, { vertexColors: true, side: THREE.DoubleSide, scale: 0.45 });
    const cap = new THREE.Mesh(polarGrid(rows, Z.front, radiusAt, capColor), capMat);
    cap.geometry.computeVertexNormals();
    const nrm = cap.geometry.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 0, 1);
    this.group.add(cap);

    // Terrain side wall: the seabed surface receding into the screen, with some lumpy relief.
    const zs = [Z.front, Z.front - 0.6, Z.front - 2, Z.front - 5, Z.front - 9, Z.front - 14, Z.back];
    const cols = SEG * 2 + 1, segW = SEG * 2;
    const wpos = new Float32Array(zs.length * cols * 3), wcol = new Float32Array(zs.length * cols * 3);
    for (let k = 0; k < zs.length; k++) {
      for (let i = 0; i < cols; i++) {
        const th = (i / segW) * TAU, j = k * cols + i;
        const relief = k === 0 ? 0 : Math.sin(th * 173 + k * 2.1) * 0.35 + Math.sin(th * 61 + k * 1.3) * 0.5;
        const r = this.ground(th) + relief;
        wpos.set([Math.cos(th) * r, Math.sin(th) * r, zs[k]], j * 3);
        const above = r > R - 0.3;
        let c = (above ? P.grass : P.sand).clone();
        if (k === 0) c.multiplyScalar(1.08);
        c.multiplyScalar(1 - k * 0.04);
        c = this.depthTint(c, r);
        wcol.set([c.r, c.g, c.b], j * 3);
      }
    }
    const widx = [];
    for (let k = 0; k < zs.length - 1; k++) {
      for (let i = 0; i < segW; i++) {
        const a = k * cols + i, b = a + 1, c = a + cols, d = c + 1;
        widx.push(a, b, d, a, d, c);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
    wg.setIndex(widx);
    wg.computeVertexNormals();
    this.group.add(new THREE.Mesh(wg, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide, grime: 0.75, scale: 0.8, streak: 0.2 })));

    // Core glow.
    const coreR = Math.min(...Array.from({ length: 64 }, (_, i) => this.ground((i / 64) * TAU))) * 0.13;
    this.core = new THREE.Mesh(new THREE.CircleGeometry(coreR, 48), new THREE.MeshBasicMaterial({ color: P.core, fog: false }));
    this.core.position.z = Z.front + 0.05;
    this.group.add(this.core);

    // Far reef silhouette.
    const far = new THREE.Mesh(polarGrid(2, Z.far, (th, k) => (k ? this.farGround(th) : 0), (th, k, r) => {
      const c = P.far.clone().lerp(P.abyss, k ? clamp((R - r) / (R * 0.7), 0, 1) * 0.75 : 0.85);
      return [c.r, c.g, c.b];
    }), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.farMesh = far;
    this.group.add(far);

    // Water: opaque back disc, translucent front glass, surface sheet and foam.
    this.wFr = [0, 0.3, 0.55, 0.75, 0.88, 0.96, 1];
    const waterCol = (th, k) => {
      const f = this.wFr[k];
      const c = f < 0.55 ? P.abyss.clone().lerp(P.waterDeep, f / 0.55) : P.waterDeep.clone().lerp(P.waterTop, (f - 0.55) / 0.45);
      return [c.r, c.g, c.b];
    };
    const wr = (th, k) => this.wFr[k] * R;
    this.backMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.back = new THREE.Mesh(polarGrid(this.wFr.length, Z.water, wr, waterCol, false, WSEG), this.backMat);
    this.glass = new THREE.Mesh(polarGrid(this.wFr.length, Z.glass, wr, waterCol, false, WSEG), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false,
    }));
    this.glass.renderOrder = 10;

    const wcols = WSEG + 1;
    const rib = new THREE.BufferGeometry();
    rib.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wcols * 2 * 3), 3));
    rib.setAttribute('crest', new THREE.BufferAttribute(new Float32Array(wcols * 2), 1));
    const ruv = new Float32Array(wcols * 2 * 2);
    for (let i = 0; i < wcols; i++) { ruv.set([(i / WSEG) * TAU * R, 1], i * 2); ruv.set([(i / WSEG) * TAU * R, 0], (i + wcols) * 2); }
    rib.setAttribute('uv', new THREE.BufferAttribute(ruv, 2));
    const ridx = [];
    for (let i = 0; i < WSEG; i++) { const a = i, b = i + 1, c = i + wcols, d = c + 1; ridx.push(a, b, d, a, d, c); }
    rib.setIndex(ridx);
    this.ribMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uStorm: { value: 0 }, uLight: { value: 1 },
        uTop: { value: P.waterTop.clone().lerp(P.sky, 0.25) }, uDeep: { value: P.waterDeep.clone() }, uFoam: { value: new THREE.Color('#e6ece8') },
      }]),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      vertexShader: /* glsl */`
        attribute float crest; varying float vCrest; varying vec2 vU;
        #include <fog_pars_vertex>
        void main(){ vCrest = crest; vU = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uDeep, uFoam; uniform float uTime, uStorm, uLight; varying float vCrest; varying vec2 vU;
        #include <fog_pars_fragment>
        ${NOISE}
        void main(){
          float x = vU.x, z = vU.y * 48.0;
          vec3 q = vec3(x * 0.35, z * 0.35, uTime * 0.5);
          float rip = fbm(q + vec3(uTime*0.3*${'1.0'}, 0.0, 0.0));
          float rip2 = n3(vec3(x * 1.6, z * 1.6, uTime * 1.4));
          vec3 c = mix(uTop, uDeep, vU.y * 0.75);
          c *= 0.72 + 0.45 * rip + 0.18 * rip2;
          float glint = smoothstep(0.7, 0.92, rip * rip2 * 1.6) * (1.0 - uStorm * 0.8);
          float foam = smoothstep(0.45, 0.95, vCrest + (rip - 0.5) * 0.9) * (0.25 + uStorm);
          foam += smoothstep(0.62, 0.85, rip) * uStorm * 0.6;
          c = mix(c, uFoam, clamp(foam, 0.0, 0.95));
          c += glint * 0.3;
          gl_FragColor = vec4(c * uLight, 0.9);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.ribbon = new THREE.Mesh(rib, this.ribMat);
    this.ribbon.renderOrder = 9;
    this.foam = new THREE.Mesh(polarGrid(2, Z.glass + 0.05, (th, k) => R + (k ? 0.15 : -0.5), () => [1, 1, 1], false, WSEG), new THREE.MeshBasicMaterial({
      color: 0xdfe6e2, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    this.foam.renderOrder = 11;
    for (const m of [this.back, this.glass, this.ribbon, this.foam]) { m.frustumCulled = false; this.group.add(m); }

    // Atmosphere halo.
    const haloR = [R - 4, R + this.A * 0.5, R + this.A, R + this.A + this.F * 0.35, R + this.A + this.F * 0.75];
    const haloA = [0.95, 0.8, 0.5, 0.18, 0];
    const halo = new THREE.Mesh(polarGrid(5, Z.halo, (th, k) => haloR[k], (th, k) => [P.sky.r, P.sky.g, P.sky.b, haloA[k]], true), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, fog: false,
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
    const mat = toon('#cfe3ec', { rough: 0.25, grime: 0.35, scale: 0.5, streak: 0.2 });
    const top = toon('#eef4f6', { rough: 0.7, grime: 0.3, scale: 0.8 });
    for (const [a0, a1] of this.ice) {
      const sh = new THREE.Shape();
      const ro = this.R + 1.1, ri = this.R - 1.5;
      sh.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
      sh.absarc(0, 0, ro, a0, a1, false);
      sh.absarc(0, 0, ri, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(sh, { depth: Z.glass - Z.water + 1, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 2, curveSegments: Math.ceil((a1 - a0) * 90) });
      const m = new THREE.Mesh(g, [top, mat]);
      m.position.z = Z.water;
      this.group.add(m);
      for (let a = a0 + 0.03; a < a1 - 0.02; a += 0.04 + this.rng() * 0.05) {
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), top);
        s.scale.set(1.2 + this.rng() * 2.4, 0.4 + this.rng() * 0.9, 1.2 + this.rng() * 2.4);
        this.place(s, a, this.R + 1.1, -32 + this.rng() * 38);
        s.rotation.y = this.rng() * TAU;
        this.group.add(s);
      }
    }
  }

  /** Layered, noise-shaded cloud deck: several annuli at different depths give it volume. */
  buildClouds() {
    const R = this.R;
    this.cloudMats = [];
    const layers = [[-38, 1.0], [-26, 0.95], [-14, 0.9], [-4, 0.75], [5, 0.45]];
    layers.forEach(([z, alpha], li) => {
      const g = new THREE.RingGeometry(R + 2, R + this.A + 34, 360, 6);
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uCover: { value: 0.4 }, uStorm: { value: 0 }, uR: { value: R }, uZ: { value: z + li * 13.7 },
          uAlpha: { value: alpha }, uLight: { value: 1 },
          uLit: { value: new THREE.Color('#e9e4d8') }, uShade: { value: new THREE.Color('#5e6470') },
          uStormLit: { value: new THREE.Color('#6a6f78') }, uStormShade: { value: new THREE.Color('#1c1f26') },
          uWind: { value: 1 }, uTop: { value: this.A + 30 },
        },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */`
          uniform float uTime, uCover, uStorm, uR, uZ, uAlpha, uLight, uWind, uTop;
          uniform vec3 uLit, uShade, uStormLit, uStormShade; varying vec2 vP;
          ${NOISE}
          float dens(float th, float alt){
            float K = uR * 0.05;
            vec3 q = vec3(cos(th) * K, sin(th) * K, alt * 0.075 + uZ * 0.05);
            q += vec3(0.0, 0.0, uTime * 0.015);
            float d = fbm(q);
            float band = smoothstep(4.0, 14.0, alt) * (1.0 - smoothstep(uTop * 0.55, uTop, alt));
            return d * band;
          }
          void main(){
            float r = length(vP), th = atan(vP.y, vP.x) + uTime * 0.004 * uWind;
            float alt = r - uR;
            float d = dens(th, alt);
            float thr = 0.62 - uCover * 0.32;
            float a = smoothstep(thr, thr + 0.16, d);
            if (a < 0.01) discard;
            // light from "above": compare against density a little further out
            float d2 = dens(th, alt + 3.0);
            float shade = clamp(0.55 + (d - d2) * 5.0 + (alt - 10.0) * 0.012, 0.0, 1.0);
            vec3 lit = mix(uLit, uStormLit, uStorm), sh = mix(uShade, uStormShade, uStorm);
            vec3 c = mix(sh, lit, shade) * uLight;
            gl_FragColor = vec4(c, a * uAlpha * (0.75 + 0.25 * uStorm));
            #include <colorspace_fragment>
          }`,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.z = z;
      mesh.renderOrder = z > 0 ? 14 : -0.5;
      mesh.frustumCulled = false;
      this.cloudMats.push(m);
      this.group.add(mesh);
    });
  }

  buildKelp() {
    const n = this.def.kelp || 30, R = this.R, rng = this.rng;
    const pos = [], col = [], sway = [], phase = [], tang = [], idx = [];
    let v = 0;
    for (let q = 0; q < n; q++) {
      const th = rng() * TAU, g = this.ground(th);
      if (g > R - 8 || (this.ice.length && this.inIce(th) && rng() < 0.5)) continue;
      const z = -14 + rng() * 17, h = Math.min(5 + rng() * 16, R - g - 3), segs = 14, w = 0.4 + rng() * 0.5;
      const ux = Math.cos(th), uy = Math.sin(th), tx = -uy, ty = ux, ph = rng() * TAU;
      const base = this.pal.kelp.clone().offsetHSL((rng() - 0.5) * 0.06, -0.1, (rng() - 0.5) * 0.15);
      for (let s = 0; s <= segs; s++) {
        const f = s / segs, r = g - 0.4 + f * h, ww = w * (1 - f * 0.6) * (1 + 0.45 * Math.sin(f * 17 + ph));
        for (const side of [-1, 1]) {
          pos.push(ux * r + tx * ww * side, uy * r + ty * ww * side, z);
          const c = this.depthTint(base, r, 0.55).multiplyScalar((0.55 + f * 0.5) * (side > 0 ? 1 : 0.8));
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
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uLight: { value: 1 }, uStorm: { value: 0 } }]),
      side: THREE.DoubleSide, fog: true,
      vertexShader: /* glsl */`
        uniform float uTime, uStorm; attribute vec3 kcol; attribute float sway; attribute float phase; attribute vec2 tang;
        varying vec3 vC;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          float amp = 1.0 + uStorm * 1.5;
          float s = (sin(uTime*1.3 + phase + sway*3.5) * 1.6 + sin(uTime*0.6 + phase) * 0.8 + sin(uTime*3.1 + sway*9.0) * 0.25) * sway * amp;
          p.xy += tang * s;
          vC = kcol;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uLight; varying vec3 vC;
        #include <fog_pars_fragment>
        void main(){ gl_FragColor = vec4(vC * uLight, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const m = new THREE.Mesh(g, this.kelpMat);
    m.frustumCulled = false;
    this.group.add(m);
  }

  buildCoral() {
    const n = this.def.coral || 60, R = this.R, rng = this.rng;
    const shapes = [
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.ConeGeometry(0.7, 2.6, 9, 4),
      new THREE.CylinderGeometry(0.35, 0.5, 2.4, 10, 3),
      new THREE.DodecahedronGeometry(1.2, 1),
      new THREE.TorusKnotGeometry(0.6, 0.2, 40, 6, 2, 3),
    ];
    // Lumpy rocks: jitter the dodecahedron.
    const rp = shapes[3].attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * (0.8 + rng() * 0.4), rp.getY(i) * (0.7 + rng() * 0.4), rp.getZ(i) * (0.8 + rng() * 0.4));
    shapes[3].computeVertexNormals();
    const per = shapes.map(() => []);
    for (let i = 0; i < n; i++) {
      const th = rng() * TAU, g = this.ground(th);
      if (g > R - 3) continue;
      const kind = Math.floor(rng() * shapes.length);
      per[kind].push({ th, g, z: -14 + rng() * 19, s: 0.6 + rng() * 1.6, c: kind === 3 ? this.pal.rock2 : this.pal.coral[Math.floor(rng() * this.pal.coral.length)] });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    shapes.forEach((geo, k) => {
      const list = per[k];
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, toon(0xffffff, { grime: 0.7, scale: 1.2, rough: k === 3 ? 0.95 : 0.7 }), list.length);
      list.forEach((it, i) => {
        const sink = k === 0 ? 0.3 : k === 3 ? 0.5 : -1.0;
        p.set(Math.cos(it.th) * (it.g - sink * it.s * 0.5), Math.sin(it.th) * (it.g - sink * it.s * 0.5), it.z);
        e.set((rng() - 0.5) * 0.4, rng() * TAU, it.th - Math.PI / 2 + (rng() - 0.5) * 0.4);
        q.setFromEuler(e);
        s.set(it.s, it.s * (k === 0 ? 0.7 : 1), it.s);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
        im.setColorAt(i, this.depthTint(it.c.clone().offsetHSL(0, -0.15, -0.05), it.g, 0.55));
      });
      im.frustumCulled = false;
      this.group.add(im);
    });
  }

  // ---------- per-frame ----------
  update(dt, simulate, visible, light) {
    this.t += dt;
    this.weather.update(dt);
    if (simulate) this.stepWaves(dt);
    const storm = this.weather.storm;
    this.kelpMat.uniforms.uTime.value = this.t;
    this.kelpMat.uniforms.uLight.value = 0.35 + 0.65 * light;
    this.kelpMat.uniforms.uStorm.value = storm;
    this.backMat.color.setScalar(0.3 + 0.7 * light);
    this.farMesh.material.color.setScalar(0.4 + 0.6 * light);
    this.core.scale.setScalar(1 + 0.06 * Math.sin(this.t * 2));
    for (const m of this.cloudMats) {
      m.uniforms.uTime.value = this.t;
      m.uniforms.uStorm.value = storm;
      m.uniforms.uCover.value = 0.25 + 0.75 * storm;
      m.uniforms.uWind.value = this.weather.wind;
      m.uniforms.uLight.value = 0.55 + 0.45 * light;
    }
    if (!visible) return;
    this.ribMat.uniforms.uTime.value = this.t;
    this.ribMat.uniforms.uStorm.value = storm;
    this.ribMat.uniforms.uLight.value = 0.45 + 0.55 * light;
    for (let i = 0; i <= WSEG; i++) this.surf[i] = this.surface((i / WSEG) * TAU);
    const cols = WSEG + 1;
    for (const mesh of [this.back, this.glass]) {
      const a = mesh.geometry.attributes.position;
      for (let k = 0; k < this.wFr.length; k++) {
        const f = this.wFr[k];
        if (f < 0.85) continue;
        for (let i = 0; i < cols; i++) {
          const th = (i / WSEG) * TAU, r = f * this.surf[i];
          a.setXY(k * cols + i, Math.cos(th) * r, Math.sin(th) * r);
        }
      }
      a.needsUpdate = true;
    }
    const rp = this.ribbon.geometry.attributes.position, cr = this.ribbon.geometry.attributes.crest;
    const fp = this.foam.geometry.attributes.position;
    const norm = 1 / (0.4 + this.seaState * 1.2);
    for (let i = 0; i < cols; i++) {
      const th = (i / WSEG) * TAU, r = this.surf[i], cx = Math.cos(th), sy = Math.sin(th);
      rp.setXYZ(i, cx * r, sy * r, Z.water);
      rp.setXYZ(i + cols, cx * r, sy * r, Z.glass);
      const crest = (r - this.R) * norm;
      cr.setX(i, crest); cr.setX(i + cols, crest);
      const fw = 0.3 + Math.max(0, crest) * (0.3 + storm * 1.2);
      fp.setXY(i, cx * (r - fw), sy * (r - fw));
      fp.setXY(i + cols, cx * (r + 0.12), sy * (r + 0.12));
    }
    rp.needsUpdate = true;
    cr.needsUpdate = true;
    fp.needsUpdate = true;
  }
}

export function smoothLight(depth, R) { return clamp(1 - smoothstep(0, R * 0.7, depth) * 0.9, 0.1, 1); }
