export const SLOTS = [
  ['hull', 'Hull'], ['engine', 'Engine'], ['fins', 'Fins'], ['rocket', 'Rocket'], ['lamp', 'Lamp'], ['paint', 'Paint'],
];

export const PARTS = {
  hull: [
    { id: 'tincan', name: 'Tin Can', desc: 'Cheerful, dented, mostly watertight.', price: 0, hp: 60, depth: 45, drag: 1.0 },
    { id: 'ray', name: 'Manta Shell', desc: 'A sleek smuggler hull. Slippery and quick.', price: 180, hp: 80, depth: 62, drag: 0.8 },
    { id: 'bathy', name: 'Bathysphere', desc: 'A thick iron ball that laughs at pressure.', price: 150, hp: 120, depth: 95, drag: 1.12 },
  ],
  engine: [
    { id: 'paddle', name: 'Pedal Paddle', desc: 'One propeller, two tired legs.', price: 0, thrust: 30 },
    { id: 'twin', name: 'Twin Screw', desc: 'Two propellers! Twice the paddle.', price: 70, thrust: 40 },
    { id: 'jet', name: 'Squid Jet', desc: 'Borrowed from a very large squid. Do not ask.', price: 160, thrust: 54 },
  ],
  fins: [
    { id: 'stubby', name: 'Stubby Fins', desc: 'They mostly keep it pointing forwards.', price: 0, turn: 3.2, glide: 0 },
    { id: 'wings', name: 'Gull Wings', desc: 'Long wings for long leaps. Glide when you fall.', price: 50, turn: 3.0, glide: 1.0 },
    { id: 'flukes', name: 'Whale Flukes', desc: 'Nimble tail flukes, a little glide.', price: 90, turn: 4.8, glide: 0.55 },
  ],
  rocket: [
    { id: 'fizz', name: 'Fizz Bottle', desc: 'Shake well. A good leap, no further.', price: 0, thrust: 26, fuel: 0.7 },
    { id: 'kettle', name: 'Kettle Rocket', desc: 'Whistles on the boil. Can reach the sky beyond the sky.', price: 80, thrust: 19, fuel: 1.7 },
    { id: 'comet', name: 'Comet Booster', desc: 'Contraband. Extremely fast. Extremely.', price: 250, thrust: 24, fuel: 2.6 },
  ],
  lamp: [
    { id: 'candle', name: 'Jar Candle', desc: 'A brave little flame.', price: 0, range: 16, power: 1 },
    { id: 'search', name: 'Searchlight', desc: 'Lights up the deep… and everything in it.', price: 40, range: 34, power: 2.4 },
    { id: 'glowcap', name: 'Glowcap Lantern', desc: 'A soft mushroom glow anglers ignore.', price: 60, range: 24, power: 1.6, sneaky: true },
  ],
};

export const PAINTS = [
  ['Mustard', '#c49a2c'], ['Oxblood', '#8a3028'], ['Verdigris', '#4a8a72'], ['Slate', '#5a6478'],
  ['Rust', '#a85a2a'], ['Navy', '#2a3a5a'], ['Bone', '#d4ccb4'], ['Pitch', '#2a2624'],
];

export const STARTER = { hull: 'tincan', engine: 'paddle', fins: 'stubby', rocket: 'fizz', lamp: 'candle', paint: '#c49a2c' };

export const part = (slot, id) => PARTS[slot].find((p) => p.id === id);

export function stats(equip) {
  const h = part('hull', equip.hull), e = part('engine', equip.engine), f = part('fins', equip.fins);
  const r = part('rocket', equip.rocket), l = part('lamp', equip.lamp);
  const q = 0.13 * h.drag;
  const top = (-0.6 + Math.sqrt(0.36 + 4 * q * e.thrust)) / (2 * q);
  return {
    hp: h.hp, depth: h.depth, drag: h.drag, thrust: e.thrust, turn: f.turn, glide: f.glide,
    rocketThrust: r.thrust, fuel: r.fuel, lampRange: l.range, lampPower: l.power, sneaky: !!l.sneaky,
    topSpeed: top,
  };
}
