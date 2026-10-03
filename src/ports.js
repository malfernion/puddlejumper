import * as THREE from 'three';
import { TAU, mulberry32 } from './util.js';
import { toon, metal, woodMat, stone, glowSprite, addEyes } from './toon.js';

// Weathered stilt-towns. Local frame: +x along the coast, +y up (radial), z into/out of the screen.
// The waterline is y = 0 and the deck top sits at y = DECK.
const DECK = 3.3;

const M = {
  plank: () => woodMat('#6e5038', { scale: 2.4 }),
  plankGrey: () => woodMat('#7c7468', { scale: 2.4 }),
  dark: () => woodMat('#3a2a1e', { scale: 2 }),
  pile: () => woodMat('#3f3226', { scale: 1.6, grime: 0.95, streak: 0.9 }),
  rust: () => metal('#7a4a30', { rough: 0.85, metal: 0.4 }),
  iron: () => metal('#34322f'),
  tin: () => metal('#8b8a84', { rough: 0.55 }),
  rope: () => toon('#8a7856', { rough: 1, grime: 0.6, scale: 4 }),
  glass: () => new THREE.MeshStandardMaterial({ color: '#c8d8d8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28 }),
  warm: (c = '#ffb45a') => new THREE.MeshStandardMaterial({ color: '#2a1a0a', emissive: c, emissiveIntensity: 2.2, roughness: 0.6 }),
};

function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
const boxM = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

/** Instanced planks with jittered height, tilt and tone. */
function planks(g, rng, { x0, x1, z0, z1, y, pitch = 0.5, mat, vertical = false, tone = 0.25 }) {
  const n = Math.floor((x1 - x0) / pitch);
  const len = vertical ? y : z1 - z0;
  const geo = vertical ? new THREE.BoxGeometry(pitch * 0.9, 1, 0.12) : new THREE.BoxGeometry(pitch * 0.88, 0.16, 1);
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * pitch;
    if (vertical) {
      const h = len * (0.96 + rng() * 0.06);
      m4.compose(new THREE.Vector3(x, h / 2, z1), q.setFromEuler(e.set(0, 0, (rng() - 0.5) * 0.02)), new THREE.Vector3(1, h, 1));
    } else {
      const l = len * (0.9 + rng() * 0.1);
      m4.compose(new THREE.Vector3(x, y + (rng() - 0.5) * 0.06, (z0 + z1) / 2 + (rng() - 0.5) * 0.4), q.setFromEuler(e.set((rng() - 0.5) * 0.02, (rng() - 0.5) * 0.03, (rng() - 0.5) * 0.04)), new THREE.Vector3(1, 1, l));
    }
    im.setMatrixAt(i, m4);
    im.setColorAt(i, c.setScalar(1 - tone / 2 + rng() * tone));
  }
  g.add(im);
  return im;
}

/** Rope hanging between two points (catenary-ish sag). */
function rope(a, b, sag, mat, r = 0.05) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 5), mat);
}

/** Corrugated sheet: a w×l plane with ridges running along its length. */
function corrugated(w, l, mat) {
  const geo = new THREE.PlaneGeometry(w, l, Math.ceil(w * 7), 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.06);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function barrel(mat, hoop) {
  const g = new THREE.Group();
  const prof = [new THREE.Vector2(0, -0.6)];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.42 + Math.sin(t * Math.PI) * 0.08, -0.6 + t * 1.2)); }
  prof.push(new THREE.Vector2(0, 0.6));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 16), mat));
  for (const y of [-0.42, 0.42]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 5, 18), hoop); h.rotation.x = Math.PI / 2; h.position.y = y; g.add(h); }
  return g;
}

function crate(mat, slat, s = 1) {
  const g = new THREE.Group();
  g.add(boxM(1.2 * s, 1.2 * s, 1.2 * s, mat, 0, 0, 0));
  for (const z of [-0.62, 0.62]) {
    g.add(boxM(1.25 * s, 0.14 * s, 0.05, slat, 0, 0.5 * s, z * s), boxM(1.25 * s, 0.14 * s, 0.05, slat, 0, -0.5 * s, z * s));
    const d = boxM(1.6 * s, 0.14 * s, 0.05, slat, 0, 0, z * s); d.rotation.z = 0.78; g.add(d);
  }
  return g;
}

/** A board-and-batten shack with a rusty corrugated gable roof, window, door, chimney and lantern. */
function shack(rng, o) {
  const { w = 3.4, h = 2.8, d = 3.2, wall = '#5a4a3a', roofC = '#7a4a30', lean = 0, lit = '#ffb45a', chimney = true, snow = false } = o;
  const g = new THREE.Group();
  const wm = woodMat(wall, { scale: 2.2 });
  g.add(boxM(w, h, d, wm, 0, h / 2, 0));
  // Battens on the visible faces.
  const bat = woodMat(wall, { scale: 2.2, color: undefined });
  for (let x = -w / 2 + 0.25; x < w / 2; x += 0.42) g.add(boxM(0.07, h, 0.06, bat, x, h / 2, d / 2 + 0.03));
  for (let z = -d / 2 + 0.25; z < d / 2; z += 0.42) for (const s of [-1, 1]) g.add(boxM(0.06, h, 0.07, bat, s * (w / 2 + 0.03), h / 2, z));
  // Corner posts and sill.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(boxM(0.2, h + 0.1, 0.2, M.dark(), sx * w / 2, h / 2, sz * d / 2));
  g.add(boxM(w + 0.3, 0.18, d + 0.3, M.dark(), 0, 0.09, 0));
  // Gable roof of corrugated tin.
  const pitch = 0.62, half = w / 2 + 0.35, slope = half / Math.cos(pitch);
  const rm = metal(roofC, { rough: 0.8, metal: 0.45, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const sheet = corrugated(d + 0.7, slope, rm);
    // Plane x → along the ridge (world z), plane y → up the slope toward the ridge.
    const X = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(-s * Math.cos(pitch), Math.sin(pitch), 0);
    sheet.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y)));
    sheet.position.set(s * half / 2, h + Math.tan(pitch) * half / 2, 0);
    g.add(sheet);
    if (snow) { const sn = mesh(new THREE.BoxGeometry(slope, 0.35, d + 0.6), toon('#eef2f2', { grime: 0.2 }), s * half / 2, h + Math.tan(pitch) * half / 2 + 0.22, 0); sn.rotation.z = -s * pitch; g.add(sn); }
  }
  // Gable end triangles.
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, Math.tan(pitch) * w / 2); tri.closePath();
  for (const z of [-d / 2, d / 2]) { const t = mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ color: wall, roughness: 0.9, side: THREE.DoubleSide }), 0, h, z); g.add(t); }
  g.add(boxM(0.14, 0.14, d + 0.8, M.dark(), 0, h + Math.tan(pitch) * half - 0.05, 0));
  // Window with frame, mullions and warm light.
  const wx = w * 0.18, wy = h * 0.58;
  g.add(boxM(1.0, 0.9, 0.05, M.warm(lit), wx, wy, d / 2 + 0.07));
  for (const [ww, hh, x, y] of [[1.15, 0.1, wx, wy + 0.48], [1.15, 0.1, wx, wy - 0.48], [0.1, 1.0, wx - 0.55, wy], [0.1, 1.0, wx + 0.55, wy], [0.05, 0.9, wx, wy], [1.0, 0.05, wx, wy]]) g.add(boxM(ww, hh, 0.08, M.dark(), x, y, d / 2 + 0.1));
  g.add(boxM(1.3, 0.1, 0.3, M.dark(), wx, wy - 0.55, d / 2 + 0.18));
  // Door.
  g.add(boxM(0.85, 1.75, 0.08, woodMat('#3a2c22', { scale: 3 }), -w * 0.26, 0.9, d / 2 + 0.07));
  g.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), M.tin(), -w * 0.26 + 0.3, 0.9, d / 2 + 0.14));
  const smoke = [];
  if (chimney) {
    const cx = -w * 0.25, cy = h + Math.tan(pitch) * w * 0.25;
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.8, 10), M.rust(), cx, cy + 0.6, -d * 0.2));
    g.add(mesh(new THREE.ConeGeometry(0.32, 0.25, 10), M.iron(), cx, cy + 1.6, -d * 0.2));
    smoke.push(new THREE.Vector3(cx, cy + 1.8, -d * 0.2));
  }
  // Bracket lantern.
  g.add(boxM(0.06, 0.06, 0.6, M.iron(), w / 2 - 0.2, h * 0.85, d / 2 + 0.3));
  const lan = mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.32, 8), M.warm(lit), w / 2 - 0.2, h * 0.85 - 0.25, d / 2 + 0.55);
  const gl = glowSprite(lit, 2.6, 0.7); gl.position.copy(lan.position);
  g.add(lan, gl);
  g.rotation.z = lean;
  g.userData.smoke = smoke;
  return g;
}

function lighthouse(rng) {
  const g = new THREE.Group();
  const H = 11;
  const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(1.9, 0)];
  for (let i = 0; i <= 10; i++) prof.push(new THREE.Vector2(1.9 - (i / 10) * 0.65, (i / 10) * H));
  prof.push(new THREE.Vector2(0, H));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), stone('#cfc6b4', { scale: 1.2 })));
  // Faded red bands.
  for (const [y0, y1] of [[2, 4], [6, 8]]) {
    const r0 = 1.9 - (y0 / H) * 0.65 + 0.02, r1 = 1.9 - (y1 / H) * 0.65 + 0.02;
    g.add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y1)], 28), toon('#8a2a24', { grime: 0.9, scale: 1.5, streak: 1 })));
  }
  // Door and slit windows.
  g.add(boxM(0.9, 1.7, 0.2, woodMat('#3a2a1e'), 0, 0.85, 1.85));
  for (const y of [4.8, 8.4]) g.add(boxM(0.25, 0.8, 0.2, M.warm('#ffcf7a'), 0, y, 1.9 - (y / H) * 0.65));
  // Gallery.
  g.add(mesh(new THREE.CylinderGeometry(1.9, 1.7, 0.3, 28), M.iron(), 0, H + 0.15, 0));
  const rail = mesh(new THREE.TorusGeometry(1.85, 0.05, 6, 32), M.iron(), 0, H + 1.1, 0); rail.rotation.x = Math.PI / 2; g.add(rail);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), M.iron(), Math.cos(a) * 1.85, H + 0.7, Math.sin(a) * 1.85)); }
  // Lantern room.
  g.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 16, 1, true), M.glass(), 0, H + 1.2, 0));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.add(mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), M.iron(), Math.cos(a) * 1.1, H + 1.2, Math.sin(a) * 1.1)); }
  g.add(mesh(new THREE.SphereGeometry(1.25, 16, 8, 0, TAU, 0, Math.PI / 2), metal('#4f6e5e', { rough: 0.6 }), 0, H + 2.1, 0));
  g.add(mesh(new THREE.ConeGeometry(0.12, 0.8, 6), M.iron(), 0, H + 3.6, 0));
  const lamp = mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshBasicMaterial({ color: '#fff3c0' }), 0, H + 1.2, 0);
  const glow = glowSprite('#ffe9a8', 12, 0.8); glow.position.copy(lamp.position);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.4, 34, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#fff2c8', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  beam.geometry.translate(0, -17, 0);
  beam.position.copy(lamp.position);
  beam.userData = { spin: 0.8 };
  g.add(lamp, glow, beam);
  return g;
}

function crane(rng, ropeMat) {
  const g = new THREE.Group();
  const wd = M.dark();
  for (const s of [-1, 1]) { const leg = boxM(0.3, 7, 0.3, wd, s * 0.9, 3.3, 0); leg.rotation.z = -s * 0.12; g.add(leg); }
  g.add(boxM(2.2, 0.25, 0.3, wd, 0, 6.6, 0));
  const boom = boxM(0.25, 7, 0.25, wd, -2.3, 5.2, 0); boom.rotation.z = 1.0; g.add(boom);
  const tip = new THREE.Vector3(-5.3, 7.1, 0), hook = new THREE.Vector3(-5.3, 2.8, 0);
  g.add(rope(new THREE.Vector3(0, 6.6, 0), tip, 0.2, ropeMat, 0.04));
  g.add(rope(tip, hook, 0.01, ropeMat, 0.04));
  const c = crate(woodMat('#7a5a38', { scale: 3 }), M.dark(), 0.9);
  c.position.set(-5.3, 2.1, 0); c.rotation.y = 0.4;
  g.add(c, mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12, Math.PI * 1.4), M.iron(), -5.3, 2.75, 0));
  // Winch drum.
  const drum = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12), M.rust(), 0, 1.0, 0); drum.rotation.x = Math.PI / 2;
  g.add(drum);
  return g;
}

function penguin() {
  const p = new THREE.Group();
  const bod = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.6, 6, 14), toon('#1c1d26', { rough: 0.5, grime: 0.2 }));
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), toon('#e8e6de', { rough: 0.6, grime: 0.2 }));
  bel.scale.set(0.8, 1.1, 0.7); bel.position.set(0, -0.05, 0.25);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), toon('#d08a20', { grime: 0.2 }));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.5, 0.5);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 6, 16), toon('#8a2a2a', { scale: 4 }));
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.25;
  p.add(bod, bel, beak, scarf);
  addEyes(p, 0, 0.7, 0.3, 0.1);
  return p;
}

/** A town on stilts sitting over the surface. */
export function buildPort(w, port) {
  const rng = mulberry32(Math.floor(port.at * 1000) + 7);
  const g = new THREE.Group();
  const style = port.style;
  const ropeMat = M.rope();
  const smoke = [];
  const deckMat = style === 'igloos' ? M.plankGrey() : M.plank();
  // Deck: joists + planks.
  planks(g, rng, { x0: -11, x1: 11, z0: -10, z1: 4, y: DECK, mat: deckMat });
  for (let z = -9.5; z <= 3.5; z += 3.25) g.add(boxM(22.4, 0.35, 0.35, M.dark(), 0, DECK - 0.26, z));
  // Pilings with cross-bracing and barnacle crust at the waterline.
  const pile = M.pile();
  const crust = toon('#5a5a4a', { grime: 1, scale: 3, rough: 1 });
  const xs = [-10.5, -6, -1.5, 3, 7.5, 10.5];
  for (const x of xs) {
    for (const z of [-9.6, -3, 3.6]) {
      const th = port.at - x / w.R;
      const down = w.R - w.ground(th) + DECK;
      const p = mesh(new THREE.CylinderGeometry(0.32, 0.4, down, 9), pile, x, DECK - down / 2, z);
      p.rotation.z = (rng() - 0.5) * 0.04;
      g.add(p);
      const ring = mesh(new THREE.CylinderGeometry(0.48, 0.5, 1.4, 9), crust, x, -0.6, z);
      g.add(ring);
    }
  }
  for (let i = 0; i < xs.length - 1; i++) {
    for (const z of [-9.6, 3.6]) {
      for (const y of [-6, 1.2]) {
        const dx = xs[i + 1] - xs[i];
        const br = boxM(Math.hypot(dx, 4.5), 0.22, 0.18, pile, (xs[i] + xs[i + 1]) / 2, y, z);
        br.rotation.z = Math.atan2(4.5, dx) * (i % 2 ? 1 : -1);
        g.add(br);
      }
    }
  }
  // Railing posts with rope along the front edge.
  const posts = [];
  for (let x = -10.5; x <= 10.6; x += 3.5) { g.add(boxM(0.18, 1.3, 0.18, M.dark(), x, DECK + 0.65, 4.0)); posts.push(new THREE.Vector3(x, DECK + 1.2, 4.0)); }
  for (let i = 0; i < posts.length - 1; i++) g.add(rope(posts[i], posts[i + 1], 0.25, ropeMat));
  // Ladder down to the water.
  for (const s of [-0.4, 0.4]) g.add(boxM(0.1, DECK + 2, 0.1, M.dark(), 4.9 + s, DECK / 2 - 1, 4.2));
  for (let y = -1.5; y < DECK; y += 0.45) g.add(boxM(0.9, 0.07, 0.08, M.dark(), 4.9, y, 4.2));

  const top = DECK + 0.08;
  const add = (o, x, z, ry = 0) => { o.position.set(x, top, z); o.rotation.y = ry; g.add(o); if (o.userData.smoke) for (const s of o.userData.smoke) smoke.push(s.clone().applyMatrix4(new THREE.Matrix4().compose(o.position, o.quaternion, o.scale))); return o; };
  const cargo = (x, z) => {
    const b = barrel(woodMat('#6a4428', { scale: 4 }), M.iron());
    add(b, x, z); b.position.y += 0.6;
    if (rng() < 0.6) { const b2 = barrel(woodMat('#5a3a22', { scale: 4 }), M.iron()); add(b2, x + 1, z + 0.4); b2.position.y += 0.6; }
    const c = crate(woodMat('#7a5a38', { scale: 3 }), M.dark()); add(c, x - 1.2, z - 0.6, rng()); c.position.y += 0.6;
  };

  if (style === 'harbour') {
    add(shack(rng, { wall: '#4f6b6a', roofC: '#7a4a30' }), -6.8, -5);
    add(shack(rng, { wall: '#8a6a3c', roofC: '#5a5a58', w: 3.8, h: 3.4 }), -2, -7.2);
    add(shack(rng, { wall: '#6e3a32', roofC: '#7a5a3a', w: 3, chimney: false }), 2.4, -4.4);
    add(lighthouse(rng), 8, -6.5);
    add(crane(rng, ropeMat), -10, 1.5);
    cargo(0.5, 1.6); cargo(-4.5, 2);
    // Nets drying on a line.
    const a = new THREE.Vector3(-8.5, top + 3, 0.5), b = new THREE.Vector3(-3.5, top + 3, 0.5);
    g.add(boxM(0.12, 3, 0.12, M.dark(), -8.5, top + 1.5, 0.5), boxM(0.12, 3, 0.12, M.dark(), -3.5, top + 1.5, 0.5), rope(a, b, 0.3, ropeMat, 0.03));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2, 12, 6), new THREE.MeshStandardMaterial({ color: '#4a5a4a', wireframe: true }));
    net.position.set(-6, top + 2.0, 0.55);
    g.add(net);
  } else if (style === 'shacks') {
    add(shack(rng, { wall: '#3e4a3a', roofC: '#4a3a2e', lit: '#9cff6b', lean: 0.05, h: 3.2 }), -7, -6);
    const upper = add(shack(rng, { wall: '#4a3a46', roofC: '#3e3a32', lit: '#9cff6b', lean: -0.08, w: 3, h: 2.4 }), -6.8, -6.3);
    upper.position.y += 3.6;
    add(shack(rng, { wall: '#3a3e4a', roofC: '#5a3a2a', lit: '#c4ff7a', lean: -0.04, w: 4, h: 3.6 }), -0.5, -7.4);
    add(shack(rng, { wall: '#4a4036', roofC: '#4a4a46', lit: '#9cff6b', lean: 0.1, w: 2.8, h: 2.6 }), 5.5, -4.8);
    const sign = boxM(5, 1.2, 0.15, woodMat('#2a2228'), 1.5, top + 7.5, -3.5); sign.rotation.z = -0.1; g.add(sign, boxM(0.2, 6, 0.2, M.dark(), 1.5, top + 3.3, -3.6));
    for (let i = 0; i < 4; i++) {
      // Hanging cages on gibbets.
      const x = -9 + i * 5.5;
      g.add(boxM(0.15, 4.5, 0.15, M.dark(), x, top + 2.25, 3.2), boxM(1.4, 0.12, 0.12, M.dark(), x + 0.6, top + 4.4, 3.2));
      const cage = new THREE.Group();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; cage.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), M.iron(), Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3)); }
      const lamp = mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#b8ff7a' }), 0, 0, 0);
      const gl = glowSprite('#9cff6b', 3.2, 0.7);
      cage.add(lamp, gl);
      cage.position.set(x + 1.2, top + 3.6, 3.2);
      g.add(cage, rope(new THREE.Vector3(x + 1.2, top + 4.4, 3.2), new THREE.Vector3(x + 1.2, top + 4.05, 3.2), 0, ropeMat, 0.02));
    }
    cargo(3, 1.5); cargo(-3.5, 2.2); cargo(8.5, 0);
  } else if (style === 'igloos') {
    add(shack(rng, { wall: '#5a6a7a', roofC: '#6a6a6a', snow: true, lit: '#ffd08a' }), -6.5, -5.5);
    add(shack(rng, { wall: '#7a5a4a', roofC: '#5a5a5a', snow: true, w: 4, h: 3.2, lit: '#ffd08a' }), -0.5, -7);
    for (const [x, z, s] of [[5.5, -5, 1.4], [9, -7.5, 1]]) {
      const ig = mesh(new THREE.SphereGeometry(2.3 * s, 24, 12, 0, TAU, 0, Math.PI / 2), toon('#dfe8ea', { grime: 0.35, scale: 1.5, rough: 0.7 }), x, top, z);
      g.add(ig);
      for (let r = 0.4; r < 1.5; r += 0.32) { const ring = mesh(new THREE.TorusGeometry(2.3 * s * Math.cos(r), 0.03, 4, 32), toon('#b8c8cc'), x, top + 2.3 * s * Math.sin(r), z); ring.rotation.x = Math.PI / 2; g.add(ring); }
    }
    for (let x = -10; x < 10; x += 1.1) { const ic = mesh(new THREE.ConeGeometry(0.1, 0.4 + rng() * 0.7, 5), toon('#e8f4f8', { rough: 0.15, grime: 0.1 }), x, DECK - 0.6, 4.05); ic.rotation.x = Math.PI; g.add(ic); }
    for (let i = 0; i < 4; i++) { const p = penguin(); p.position.set(-8 + i * 4.2, top + 0.9, 2.2); p.userData.waddle = i; g.add(p); }
    g.add(boxM(0.15, 7, 0.15, M.iron(), 8.5, top + 3.5, 1));
    const flag = boxM(2, 1.2, 0.05, toon('#7a2a2a', { scale: 3 }), 9.5, top + 6.3, 1);
    g.add(flag);
    cargo(2, 1.6);
  } else if (style === 'pagoda') {
    const lac = toon('#7a2620', { rough: 0.35, grime: 0.6, scale: 1.4 }), tile = toon('#2a2a30', { rough: 0.6, grime: 0.6 });
    for (let i = 0; i < 3; i++) {
      const s = 1 - i * 0.24, y = top + i * 3.4;
      g.add(boxM(7.5 * s, 2.6, 7 * s, woodMat('#4a2a22'), 0, y + 1.3, -5.5));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(boxM(0.3, 2.7, 0.3, lac, sx * 3.75 * s, y + 1.3, -5.5 + sz * 3.5 * s));
      const prof = [new THREE.Vector2(6.4 * s, 0), new THREE.Vector2(5.6 * s, 0.35), new THREE.Vector2(4.2 * s, 0.9), new THREE.Vector2(2.2 * s, 1.5), new THREE.Vector2(0.3, 1.8), new THREE.Vector2(0, 1.8)];
      const rf = mesh(new THREE.LatheGeometry(prof, 4), tile, 0, y + 2.6, -5.5); rf.rotation.y = Math.PI / 4; g.add(rf);
      g.add(boxM(4.5 * s, 1.0, 0.06, M.warm('#ff9a4a'), 0, y + 1.4, -5.5 + 3.5 * s + 0.05));
    }
    for (const x of [-9, -5, 6, 9.5]) {
      const lan = mesh(new THREE.SphereGeometry(0.45, 12, 10), M.warm('#ff7a3a'), x, top + 2.6, 2.6);
      lan.scale.y = 1.3;
      const gl = glowSprite('#ff7a3a', 4, 0.75); gl.position.copy(lan.position);
      g.add(boxM(0.14, 2.6, 0.14, lac, x, top + 1.3, 2.6), lan, gl);
    }
    const tub = mesh(new THREE.CylinderGeometry(2.4, 2.2, 1.2, 24), woodMat('#5a3a26', { scale: 3 }), 7, top + 0.6, -1.5);
    const water = mesh(new THREE.CircleGeometry(2.25, 24), new THREE.MeshStandardMaterial({ color: '#c4794a', roughness: 0.1, emissive: '#3a1a0a' }), 7, top + 1.1, -1.5);
    water.rotation.x = -Math.PI / 2;
    g.add(tub, water);
    g.userData.steam = new THREE.Vector3(7, top + 1.5, -1.5);
    cargo(-3, 1.8);
  }
  g.userData.smoke = smoke;
  w.place(g, port.at, w.R);
  w.group.add(g);
  return g;
}
