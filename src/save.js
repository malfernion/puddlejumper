import { STARTER } from './data/parts.js';
import { WORLDS } from './data/worlds.js';

const KEY = 'puddlejumper.save.v1';
export const SEGS = 64;

export function newSave() {
  const map = {};
  for (const w of WORLDS) map[w.id] = { known: w.id === 'puddle', seg: '0'.repeat(SEGS) };
  return {
    v: 1, pearls: 0, equip: { ...STARTER },
    owned: { hull: ['tincan'], engine: ['paddle'], fins: ['stubby'], rocket: ['fizz'], lamp: ['candle'] },
    flags: {}, map, taken: [], lit: {}, lastPort: 'barnacle', won: false, playtime: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.v !== 1) return null;
    const fresh = newSave();
    for (const id in fresh.map) if (!s.map[id]) s.map[id] = fresh.map[id];
    return { ...fresh, ...s };
  } catch { return null; }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode etc. */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
