import * as THREE from 'three';
import { damp } from './util.js';

let grad = null;
export function gradientMap() {
  if (!grad) {
    grad = new THREE.DataTexture(new Uint8Array([70, 150, 215, 255]), 4, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
  }
  return grad;
}

const cache = new Map();
/** Cached toon material by colour + options key. */
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const { unique, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...rest });
  if (!unique) cache.set(key, m);
  return m;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x15122e, side: THREE.BackSide });
/** Inverted-hull cartoon outlines for every opaque mesh in a hierarchy. */
export function outline(root, amount = 0.07) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.noOutline && !o.material.transparent) meshes.push(o); });
  for (const m of meshes) {
    const o = new THREE.Mesh(m.geometry, outlineMat);
    o.scale.setScalar(1 + amount);
    o.userData.noOutline = true;
    m.add(o);
  }
  return root;
}

let glowTex = null;
export function glowTexture() {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
}
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(size);
  s.userData.noOutline = true;
  return s;
}

/** A pair of cartoon eyes on both flanks (so they read through a roll). */
export function addEyes(parent, x, y, zHalf, size, iris = 0x15122e, white = 0xffffff) {
  const eyes = [];
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), toon(white));
    e.position.set(x, y, zHalf * s);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 12, 10), toon(iris));
    p.position.set(size * 0.25, 0, size * 0.6 * s);
    p.userData.noOutline = true;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(size * 0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(size * 0.45, size * 0.25, size * 0.95 * s);
    shine.userData.noOutline = true;
    e.add(p, shine);
    parent.add(e);
    eyes.push(e);
  }
  return eyes;
}

/**
 * Orient a +x-facing model in the XY plane. When it faces screen-left it rolls 180°
 * about its own axis (so its back stays "up"), animating the roll for a 3D turn.
 */
export function orientSide(obj, heading, rightX, rightY, st, dt, rate = 7) {
  const facingLeft = Math.cos(heading) * rightX + Math.sin(heading) * rightY < 0;
  st.roll = damp(st.roll ?? 0, facingLeft ? Math.PI : 0, rate, dt);
  obj.rotation.set(st.roll, 0, heading, 'ZYX');
}
