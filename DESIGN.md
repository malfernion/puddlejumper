# Puddlejumper — design

> *A tiny-ocean submarine odyssey.* Pilot a hand-built sub around ocean worlds small enough
> to lap in a couple of minutes, leap out of the water like a dolphin, and rocket between
> worlds to light the old beacons — charting everything you find as you go.

**Touchstones:** Ecco the Dolphin (momentum, leaping), Subnautica (depth = danger, upgrade-gated
exploration), Sunless Sea (ports, odd characters, text encounters with choices, a chart that
fills in), all filtered through a bright toy-box / picture-book look.

## Pillars

1. **Tactile water.** Water must *feel* like water: buoyancy, heavy drag, a wave surface that
   reacts to everything that crosses it. Speed is earned under water and spent in the air.
2. **Small worlds, big things.** Worlds are ~100 units in radius; you are 3.5 long; the whale is
   26 long. Scale contrast does the emotional work.
3. **Leap to explore.** The jump is the core verb: hop reef walls, launch off geysers, and with a
   good enough rocket, escape gravity entirely and fall into another world's sea.
4. **The chart remembers.** Everything you see is drawn onto a persistent chart. Lighting a
   world's beacon fills in that world completely.

## The world model (side-on)

- Each world is a **disc in the XY plane**: rocky core → seabed (procedural periodic noise +
  hand-placed features) → ocean shell → atmosphere halo → space. Gravity points to the centre.
- Rendered with a **perspective camera looking down −Z** whose *up* vector tracks the local
  radial direction, so "down" is always toward the core while you swim around the world.
- The play plane is z = 0, but geometry is **extruded in depth** (terrain −16…+6, water −40…+8)
  so the camera sees the seabed and water surface receding into the screen — a 2.5D
  diorama/aquarium look. A translucent "glass" of water sits in front of the play plane so
  everything under water is tinted.

### Physics (cartoon-scale but honest)

| Zone | Gravity | Drag | Control |
| --- | --- | --- | --- |
| Under water | toward core, cancelled by buoyancy (≈ neutral) | linear + quadratic (strong) | prop thrust along facing |
| Surface | buoyancy ∝ fraction submerged → bobbing | blended | partial thrust |
| Air (atmosphere band A) | constant g | light | aim nose, rocket; wings give glide lift |
| Falloff band F | fades linearly to 0 | none | rocket, small RCS puffs |
| Space | none | none | small RCS puffs |

- Top speed comes from `thrust = 0.6v + 0.13·drag·v²` (≈ 13 u/s stock → a leap of ≈ 8 above
  the surface, enough to clear a stock reef wall if you commit).
- Escape energy per world = `g·A + g·F/2`. Puddle: v_esc ≈ 36. The stock **Fizz Bottle**
  can't do it (huge leap, falls back); the **Kettle Rocket** can if you burn straight up.
  That's the first progression gate.
- **Wave surface:** a 1-D spring-column simulation wrapped around each world (360 columns) plus
  three travelling ambient swells. Anything that crosses the surface injects an impulse, and
  surface height feeds back into buoyancy, so you bob on the waves you make.
- Terrain collision against the seabed function with bounce, and damage over a speed threshold.
  Pressure damage below the hull's depth rating.

## Sub design (the Drydock)

Five slots plus paint. Parts are bought at ports, and each one changes the *model* (built from
primitives) as well as the stats.

| Slot | Options | Effect |
| --- | --- | --- |
| Hull | Tin Can · Manta Shell · Bathysphere | HP, depth rating, drag |
| Engine | Pedal Paddle · Twin Screw · Squid Jet | thrust → top speed |
| Fins | Stubby · Gull Wings · Whale Flukes | turn rate, glide lift |
| Rocket | Fizz Bottle · Kettle Rocket · Comet Booster | boost thrust and burn time |
| Lamp | Jar Candle · Searchlight · Glowcap Lantern | light radius; Glowcap doesn't wake anglers |

Rocket fuel only refills while submerged, so every leap is a commitment.

## Worlds

| World | Mood | Features | Gate |
| --- | --- | --- | --- |
| **Puddle** (home) | warm teal, tropical | Barnacle Bay, reef walls, Old Hum the whale, a trench with an angler, the Bottle Hermit | — |
| **Murkmoor** | swampy green/violet | Gloomwharf (smugglers), Madame Ooze, eels guarding the beacon | Kettle Rocket |
| **Frostfloe** | icy blue | ice sheets you have to find holes in, Pengwyn Point, Prof. Tusk the narwhal | Kettle Rocket |
| **Emberbrine** | hot-spring orange | geysers that launch you, Cinder Spa, anglers in a deep trench | Kettle (skilled) or Comet; Bathysphere for the beacon |
| **The Maw** | dark violet | storm wall until four beacons are lit; the kraken | 4 beacons |

## Creatures (all procedural 3D with outlined toon shading)

- **Whale (Old Hum)**: huge and friendly. Circles Puddle and breaches with enormous splashes;
  swim in its slipstream for a speed boost.
- **Narwhal (Prof. Tusk)**: Frostfloe's whale-cousin, a talker.
- **Jellies**: drifting, glowing, sting a little.
- **Eels**: fast chain-bodied hunters. They can't leave the water, so *jump* to escape.
- **Anglers**: deep lurkers that only notice you if your lamp is lit (toggle with L) or you bump
  them. The Glowcap Lantern doesn't attract them.
- **Kraken**: The Maw's guardian. Eight tentacles, very angry, really just afraid of the dark.
- **Fish schools**: ambient life that scatters from you.

## Encounters (Sunless-Sea-lite)

Dialogue trees with choices that spend or earn pearls, give parts, reveal the chart, or set
flags. Friendly ports repair for free; questionable ones charge, gamble, or ask favours. For
example, Ida's ticking crate goes from Gloomwharf to Pengwyn Point in exchange for a Comet Booster.

## Chart (persistent)

- Each world is split into 64 arcs. Arcs you swim near are inked in with the real coastline.
- A world becomes *known* when you get close or someone gives you a chart. Unknown worlds aren't
  drawn.
- Lighting a beacon inks in the whole world. The chart is saved to localStorage along with
  everything else.

## Tech

- Vite + three.js in plain ES modules, with no asset files. All models, textures, music and
  sound effects are procedural (a WebAudio synth plays generative pentatonic music that gets
  low-passed under water).
- GitHub Actions deploys to GitHub Pages.
- `?debug` turns on 1–5 to warp to a world, P for pearls and G for god mode.
