# Puddlejumper

*A tiny-ocean submarine odyssey.* Pilot a hand-built sub around ocean worlds small enough to lap in a
couple of minutes, leap from the water like a dolphin, and rocket between worlds to relight the old
beacons, charting everything you see as you go.

**Play:** https://malfernion.github.io/puddlejumper/

Side-on three.js, with no asset files: every model, texture, cloud, sound and note of music is
procedural.

## Controls

| | Keyboard | Gamepad |
| --- | --- | --- |
| Swim toward a direction (up = away from the core) | WASD / arrows | left stick / d-pad |
| Rocket boost (refills under water) | Space / Shift | A / RT |
| Dock, talk, interact | E | X |
| Lamp on/off (anglers are drawn to light) | L | B |
| Chart | M | Y |
| Pause, help, tugboat home | Esc / H | Start |

## What's in it

- **Side-on ocean worlds** with radial gravity. A perspective camera tracks "up" around the world, and
  the extruded diorama layers recede into depth fog.
- **Tactile water.** Buoyancy and drag fade as you break the surface, so speed carries into leaps.
  The swell is an 11-octave fractal of Stokes-chopped waves, plus a spring-column splash sim that
  everything disturbs. You bob on waves you made and slide down wave faces.
- **Weather.** Each world cycles calm → storm, which drives the swell height, wind, rain, lightning,
  thunder, cloud cover, ambient audio and the music (it drops into a darker minor mode).
- **Inter-world flight.** Leap hard enough with a good rocket and you escape the world's pull, drift
  across open sky, and fall (with re-entry braking) into another world's sea.
- **Drydock.** Hull, engine, fins, rocket, lamp and paint. Each part changes both the stats and the
  model.
- **Five worlds:** Puddle, Murkmoor, Frostfloe (ice sheets), Emberbrine (geysers) and The Maw (sealed
  by a storm wall until four beacons are lit).
- **Creatures:** a breaching whale you can slipstream, a narwhal professor, jellies, chain-bodied eels
  (they can't follow you out of the water), anglers that hunt by your lamp, a kraken, and fish schools.
- **Ports and characters** with Sunless-Sea-style choice encounters, including gambling, smuggling and
  fortunes.
- **A persistent chart** that inks in each coastline as you explore it. Saved to localStorage.
- **Flotsam physics:** barrels, buoys, logs and crates float, drift, tumble and get shoved around.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
```

Add `?debug` to the URL for testing keys: `1`–`5` warp to a world, `P` +500 pearls, `G` god mode,
`K` unlock all parts. `window.game.simulate(seconds, {x, y, boost})` steps the simulation
deterministically with scripted input, which is handy for tuning physics from the console.

Deployment is GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`) on every push to `main`.

See [DESIGN.md](DESIGN.md) for the design notes.
