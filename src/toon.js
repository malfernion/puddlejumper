import * as THREE from 'three';
import { damp } from './util.js';

// Shared uniforms injected into every "grimed" material.
export const SHARED = {
  uTime: { value: 0 },
  uCaustic: { value: 0 }, // 0..1 strength of underwater caustics (scene-wide, follows the camera's depth)
  uWorldC: { value: new THREE.Vector3() }, // centre of the current world (for "down" direction)
  uSurfR: { value: 100 }, // surface radius of the current world
};

const NOISE = /* glsl */`
  float gh(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float gn(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(gh(i+vec3(0,0,0)),gh(i+vec3(1,0,0)),f.x),mix(gh(i+vec3(0,1,0)),gh(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(gh(i+vec3(0,0,1)),gh(i+vec3(1,0,1)),f.x),mix(gh(i+vec3(0,1,1)),gh(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float gfbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*gn(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

/**
 * Inject world-space procedural grime into a standard material: mottled albedo, streaks running
 * "down" toward the world's core, roughness breakup, and animated caustics below the surface.
 */
function grime(m, amount, scale, streak) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SHARED);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 gwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gwp = instanceMatrix * gwp;
        #endif
        vGW = (modelMatrix * gwp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; uniform float uTime; uniform float uCaustic; uniform vec3 uWorldC; uniform float uSurfR;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gq = vGW * ${scale.toFixed(3)};
        vec2 rd = normalize(vGW.xy - uWorldC.xy + 1e-4);
        float along = dot(vGW.xy - uWorldC.xy, rd);
        float across = dot(vGW.xy - uWorldC.xy, vec2(-rd.y, rd.x));
        float mott = gfbm(gq);
        float fine = gn(gq * 7.0);
        float streaks = gn(vec3(across * ${(scale * 6).toFixed(3)}, along * ${(scale * 0.6).toFixed(3)}, vGW.z * ${(scale * 6).toFixed(3)}));
        float gm = mix(1.0, 0.55 + 0.75 * mott, ${amount.toFixed(2)}) * mix(1.0, 0.85 + 0.3 * fine, ${amount.toFixed(2)});
        gm *= 1.0 - ${streak.toFixed(2)} * smoothstep(0.55, 0.9, streaks) * 0.45;
        diffuseColor.rgb *= gm;
        // a little rust/algae tint in the crevices
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.75, 0.62, 0.45), ${amount.toFixed(2)} * smoothstep(0.62, 0.8, mott) * 0.6);
        float gRough = 0.6 + 0.4 * mott;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * gRough, 0.05, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float gR = length(vGW.xy - uWorldC.xy);
        float under = smoothstep(uSurfR + 1.0, uSurfR - 3.0, gR) * uCaustic;
        if (under > 0.0) {
          vec3 cp = vec3(vGW.xy * 0.22, uTime * 0.35);
          float c1 = abs(gn(cp) - 0.5), c2 = abs(gn(cp * 1.7 + 4.0) - 0.5);
          float caus = pow(1.0 - min(c1, c2) * 2.0, 6.0);
          float fade = smoothstep(uSurfR - 60.0, uSurfR - 4.0, gR);
          totalEmissiveRadiance += diffuseColor.rgb * caus * under * fade * 0.55;
        }`);
  };
  m.customProgramCacheKey = () => `grime${amount}${scale}${streak}`;
  return m;
}

const cache = new Map();
/**
 * The game's standard surface. Name kept from the cartoon prototype; it's now PBR + grime.
 * opts: color props plus { grime, scale, streak, metal, rough, unique }.
 */
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const { unique, grime: g = 0.55, scale = 0.35, streak = 0.6, metal = 0.0, rough = 0.85, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...rest });
  if (g > 0) grime(m, g, scale, streak);
  if (!unique) cache.set(key, m);
  return m;
}
export const metal = (color, o = {}) => toon(color, { metal: 0.65, rough: 0.5, grime: 0.8, scale: 0.9, streak: 0.9, ...o });
export const woodMat = (color, o = {}) => toon(color, { rough: 0.9, grime: 0.7, scale: 1.4, streak: 0.4, ...o });
export const stone = (color, o = {}) => toon(color, { rough: 0.95, grime: 0.8, scale: 0.6, streak: 0.8, ...o });

/** Outlines were part of the cartoon look; the grimier direction drops them. Kept as a no-op hook. */
export function outline(root) { return root; }

let glowTex = null;
export function glowTexture() {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
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
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  s.scale.setScalar(size);
  s.userData.noOutline = true;
  return s;
}

/** Wet, glossy eyes on both flanks (so they read through a roll). */
export function addEyes(parent, x, y, zHalf, size, iris = 0x0d0b14, white = 0xe8e2cf) {
  const eyes = [];
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), new THREE.MeshStandardMaterial({ color: white, roughness: 0.15 }));
    e.position.set(x, y, zHalf * s);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 16, 12), new THREE.MeshStandardMaterial({ color: iris, roughness: 0.05 }));
    p.position.set(size * 0.25, 0, size * 0.6 * s);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(size * 0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(size * 0.45, size * 0.25, size * 0.95 * s);
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
