import * as THREE from 'three';
import { toon, metal, outline, glowSprite } from './toon.js';

const brass = '#e0a93b', steel = '#b8c4d6', dark = '#3a3f58';

function propeller(blades = 3, r = 0.7) {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 10), metal(brass, { metal: 0.85, rough: 0.35, grime: 0.6 }));
  hub.rotation.z = Math.PI / 2; hub.position.x = -0.15;
  g.add(hub);
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, r, 0.32), metal(brass, { metal: 0.85, rough: 0.35, grime: 0.6 }));
    b.position.y = r / 2;
    const arm = new THREE.Group();
    arm.rotation.x = (i / blades) * Math.PI * 2;
    b.rotation.y = 0.5;
    arm.add(b);
    g.add(arm);
  }
  return g;
}

function porthole(x, y, z, r = 0.38) {
  const g = new THREE.Group();
  for (const s of [1, -1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 8, 20), metal(brass, { metal: 0.85, rough: 0.35, grime: 0.6 }));
    ring.position.set(x, y, z * s);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: '#a8f0ff' }));
    glass.position.set(x, y, z * s + 0.02 * s);
    if (s < 0) glass.rotation.y = Math.PI;
    glass.userData.noOutline = true;
    const shine = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    shine.position.set(x - r * 0.3, y + r * 0.3, z * s + 0.04 * s);
    if (s < 0) shine.rotation.y = Math.PI;
    shine.userData.noOutline = true;
    g.add(ring, glass, shine);
  }
  return g;
}

/** Build the sub from its equipped parts. Faces +x, ~3.6 long. */
export function buildSub(equip) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = equip.paint || '#ffd23f';
  const P = metal(paint, { metal: 0.25, rough: 0.6, grime: 0.75, scale: 1.1 });
  let half = 1.8, hz = 1.0, top = 1.0;

  if (equip.hull === 'bathy') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 18), P);
    body.add(ball);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 1.2, 14), P);
    tail.rotation.z = Math.PI / 2; tail.position.x = -1.3;
    body.add(tail);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      for (const s of [1, -1]) {
        const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), metal(dark));
        bolt.position.set(0.35 + Math.cos(a) * 0.62, Math.sin(a) * 0.62, 1.2 * s);
        bolt.userData.noOutline = true;
        body.add(bolt);
      }
    }
    body.add(porthole(0.35, 0, 1.22, 0.5));
    half = 1.9; hz = 1.35; top = 1.35;
  } else if (equip.hull === 'ray') {
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), P);
    hull.scale.set(2.1, 0.78, 1.25);
    body.add(hull);
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), metal(dark));
    ridge.scale.set(1.4, 0.35, 0.3); ridge.position.set(-0.3, 0.65, 0);
    body.add(ridge);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), toon('#ffffff'));
    cheek.scale.set(1.7, 0.4, 1.0); cheek.position.set(0.1, -0.38, 0);
    body.add(cheek);
    body.add(porthole(0.9, 0.12, 0.98, 0.3));
    half = 2.1; hz = 1.25; top = 0.8;
  } else {
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 1.7, 8, 18), P);
    hull.rotation.z = Math.PI / 2;
    body.add(hull);
    for (const x of [-0.7, 0.2]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 28), metal(steel));
      band.rotation.y = Math.PI / 2; band.position.x = x;
      band.userData.noOutline = true;
      body.add(band);
    }
    body.add(porthole(0.85, 0.1, 0.92, 0.36));
    half = 1.85;
  }

  // Rivet rows and plate seams (instanced so they're cheap).
  {
    const rv = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), metal(steel, { grime: 0.5 }), 120);
    const m4 = new THREE.Matrix4();
    let n = 0;
    const ringR = equip.hull === 'bathy' ? 1.35 : equip.hull === 'ray' ? 0.0 : 1.0;
    if (ringR) {
      const xs = equip.hull === 'bathy' ? [-0.55, 0.55] : [-1.15, -0.25, 0.65];
      for (const x of xs) {
        const rr = equip.hull === 'bathy' ? Math.sqrt(Math.max(0, ringR * ringR - x * x)) + 0.01 : ringR + 0.01;
        for (let i = 0; i < 26 && n < 120; i++) { const a = (i / 26) * Math.PI * 2; m4.makeTranslation(x, Math.cos(a) * rr, Math.sin(a) * rr); rv.setMatrixAt(n++, m4); }
      }
    } else {
      for (let i = 0; i < 40 && n < 120; i++) { const a = (i / 40) * Math.PI * 2; m4.makeTranslation(Math.cos(a) * 2.0, Math.sin(a) * 0.2, Math.sin(a) * 0.0 + (i % 2 ? 0.9 : -0.9) * Math.abs(Math.cos(a))); rv.setMatrixAt(n++, m4); }
    }
    rv.count = n;
    body.add(rv);
    // Hatch wheel on top.
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16), metal(brass, { metal: 0.85, rough: 0.35 }));
    wheel.rotation.x = Math.PI / 2; wheel.position.set(0.55, top + 0.05, 0);
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.03), metal(brass)); sp.rotation.y = (i / 4) * Math.PI; wheel.add(sp); sp.rotation.x = Math.PI / 2; }
    body.add(wheel);
    // Ballast tanks / skids underneath.
    for (const s of [1, -1]) {
      const skid = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, half * 1.1, 4, 10), metal(dark));
      skid.rotation.z = Math.PI / 2; skid.position.set(-0.1, -top * 0.85, s * 0.45);
      body.add(skid);
    }
  }

  // Conning tower + periscope
  if (equip.hull !== 'ray') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 14), P);
    tower.position.set(-0.25, top + 0.15, 0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 14), metal(steel));
    cap.position.set(-0.25, top + 0.52, 0);
    const peri = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), metal(steel));
    peri.position.set(-0.1, top + 0.9, 0);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), metal(steel));
    lens.rotation.z = Math.PI / 2; lens.position.set(0.02, top + 1.32, 0);
    body.add(tower, cap, peri, lens);
  }

  // Engine
  const props = [];
  if (equip.engine === 'jet') {
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 0.9, 16, 1, true), toon('#8a5cf6', { side: THREE.DoubleSide }));
    noz.rotation.z = Math.PI / 2; noz.position.x = -half - 0.3;
    const glow = glowSprite('#c4a8ff', 1.6, 0.9);
    glow.position.x = -half - 0.75;
    body.add(noz, glow);
    for (const s of [1, -1]) {
      const tent = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.8, 4, 8), toon('#8a5cf6'));
      tent.rotation.z = Math.PI / 2 + s * 0.4; tent.position.set(-half - 0.4, s * 0.5, 0);
      body.add(tent);
    }
  } else {
    const ys = equip.engine === 'twin' ? [0.45, -0.45] : [0];
    for (const y of ys) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), metal(dark));
      shaft.rotation.z = Math.PI / 2; shaft.position.set(-half - 0.15, y, 0);
      const p = propeller(equip.engine === 'twin' ? 4 : 3, equip.engine === 'twin' ? 0.55 : 0.75);
      p.position.set(-half - 0.45, y, 0);
      body.add(shaft, p);
      props.push(p);
    }
  }

  // Fins
  const finMat = toon(equip.fins === 'wings' ? '#ffffff' : '#ff6b6b');
  if (equip.fins === 'wings') {
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 3.2), finMat);
      w.position.set(-0.1, -0.15, s * 1.6 * (hz / 1.0) + s * 0.4);
      w.rotation.y = s * 0.35;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.6), toon('#ff6b6b'));
      tip.position.set(-0.25, 0, s * 1.5);
      w.add(tip);
      body.add(w);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.12), finMat);
    tail.position.set(-half + 0.1, top * 0.8 + 0.2, 0); tail.rotation.z = -0.4;
    body.add(tail);
  } else if (equip.fins === 'flukes') {
    for (const s of [1, -1]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), toon('#5ec8ff'));
      f.scale.set(0.7, 0.12, 1.1); f.position.set(-half - 0.2, 0, s * 0.9); f.rotation.y = s * 0.5;
      body.add(f);
    }
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 4), toon('#5ec8ff'));
    dorsal.position.set(-0.9, top + 0.25, 0); dorsal.rotation.z = 0.5; dorsal.scale.z = 0.3;
    body.add(dorsal);
  } else {
    for (const s of [1, -1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), finMat);
      f.position.set(-half + 0.5, -0.3, s * (hz + 0.2)); f.rotation.x = s * 0.3;
      body.add(f);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.12), finMat);
    tail.position.set(-half + 0.25, top * 0.7, 0); tail.rotation.z = -0.35;
    body.add(tail);
  }

  // Rocket
  const nozzle = new THREE.Object3D();
  if (equip.rocket === 'comet') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.2, 16), toon('#f4f1ea'));
    tube.rotation.z = Math.PI / 2; tube.position.set(-0.4, top + 0.35, 0);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 16), toon('#ff3d3d'));
    nose.rotation.z = -Math.PI / 2; nose.position.set(1.1, top + 0.35, 0);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 16), toon('#ff3d3d'));
    stripe.rotation.z = Math.PI / 2; stripe.position.set(-0.1, top + 0.35, 0);
    stripe.userData.noOutline = true;
    for (const s of [1, -1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.5), toon('#ff3d3d'));
      fin.position.set(-1.3, top + 0.35, s * 0.55);
      body.add(fin);
    }
    body.add(tube, nose, stripe);
    nozzle.position.set(-1.6, top + 0.35, 0);
  } else if (equip.rocket === 'kettle') {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), toon('#c9d4e6'));
    k.scale.set(1, 0.85, 1); k.position.set(-0.6, top + 0.55, 0);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toon('#222'));
    lid.position.set(-0.6, top + 1.05, 0);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.7, 8), toon('#c9d4e6'));
    spout.rotation.z = -Math.PI / 2 - 0.5; spout.position.set(-1.25, top + 0.4, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 12, Math.PI), toon('#222'));
    handle.position.set(-0.6, top + 0.95, 0);
    body.add(k, lid, spout, handle);
    nozzle.position.set(-1.6, top + 0.3, 0);
  } else {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12), toon('#4ee68a', { transparent: false }));
    b.rotation.z = Math.PI / 2; b.position.set(-0.6, top + 0.35, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.35, 10), toon('#4ee68a'));
    neck.rotation.z = Math.PI / 2; neck.position.set(-1.2, top + 0.35, 0);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.35, 12), toon('#ff6b6b'));
    label.rotation.z = Math.PI / 2; label.position.set(-0.55, top + 0.35, 0);
    label.userData.noOutline = true;
    body.add(b, neck, label);
    nozzle.position.set(-1.45, top + 0.35, 0);
  }
  body.add(nozzle);

  // Lamp
  const lampPos = new THREE.Object3D();
  if (equip.lamp === 'search') {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.5, 12), metal(dark));
    l.rotation.z = -Math.PI / 2; l.position.set(half - 0.1, top * 0.55, 0);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), new THREE.MeshBasicMaterial({ color: '#fffbd0' }));
    lens.rotation.y = Math.PI / 2; lens.position.set(half + 0.16, top * 0.55, 0);
    lens.userData.noOutline = true;
    body.add(l, lens);
    lampPos.position.set(half + 0.3, top * 0.55, 0);
  } else if (equip.lamp === 'glowcap') {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), toon('#e8e0c8'));
    stalk.position.set(half - 0.5, top + 0.2, 0); stalk.rotation.z = -0.6;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dffb0' }));
    cap.position.set(half - 0.15, top + 0.5, 0); cap.rotation.z = -0.6;
    body.add(stalk, cap);
    lampPos.position.set(half, top + 0.5, 0);
  } else {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 10), toon('#cdeffa'));
    jar.position.set(half - 0.3, top * 0.75 + 0.15, 0);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd84a' }));
    flame.scale.y = 1.6; flame.position.set(half - 0.3, top * 0.75 + 0.48, 0);
    flame.userData.noOutline = true;
    body.add(jar, flame);
    lampPos.position.set(half - 0.3, top * 0.75 + 0.5, 0);
  }
  const lampGlow = glowSprite(equip.lamp === 'glowcap' ? '#7dffb0' : '#fff2b0', equip.lamp === 'search' ? 3 : 2, 0.8);
  lampPos.add(lampGlow);
  body.add(lampPos);

  outline(body, 0.06);
  return { root, body, props, nozzle, lampPos, lampGlow, half };
}
