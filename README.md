# HALCYON — Chapter One: *The Terminal Hour*

A first-person shooter for a Source engine that never shipped.

**HALCYON** is a vaporware FPS: a recovered 2003-era prototype of a game about
a marble temple floating on a violet sea, a plane of circuit-board faces
reflected in a perfect mirror, a colonnade of stopped clocks, and a nexus
where a bronze sun sleeps opposite a moon that keeps runic time. It runs in a
browser, at 60fps, with no build step and no downloaded assets — every
texture, model, sound and note in it is generated at load time from code.

![The Terminal Temple](docs/shots/p1-temple.png)

---

## Running it

```bash
npm start            # serves on http://localhost:8080
```

Or point any static server at the repository root. There is nothing to
compile; `index.html` uses an import map and native ES modules, and Three.js
is vendored under `vendor/`.

Requires WebGL. Click the canvas to capture the mouse.

---

## Controls

| | |
|---|---|
| **W A S D** | move |
| **Shift / Ctrl / Space** | sprint / crouch / jump |
| **LMB / RMB** | fire / grab (Manipulator) |
| **R · E · X** | reload · use · next weapon |
| **1 2 3 4**, wheel | weapon select |
| **Q** *(hold)* | **dilate time** — the world drops to 12% speed; you do not |
| **T** | **rewind** — replays your last four seconds and puts you back in them |
| **F** | **stasis** — freezes one object or one enemy out of time |
| **`** | developer console |
| **Esc** | pause |

---

## The idea

Everything in the game is built on one asymmetry: **there are two clocks and
they disagree.**

```
realDt   — wall time.  The player, the HUD, the viewmodel live here.
worldDt  — realDt × scale.  Enemies, projectiles, props, the sea, the clouds
           and every ticking clock in the level live here.
```

When the Chronometer fires, `scale` collapses toward 0.12, the world turns to
amber syrup, and you keep moving at full speed. Every system in the codebase
had to choose, explicitly, which clock it obeys — and that choice *is* the
combat design. `src/core/Time.js` owns both.

The fiction runs on the same idea. The level opens at **11:47** and has been
11:47 for four thousand and ninety-six iterations. The chapter is over when
the hour finally moves.

---

## The four rooms

Each zone is a reconstruction of one reference plate.

| Zone | Plate | What it is |
|---|---|---|
| **A — The Terminal Temple** | violet dusk | A white marble plaza on a violet sea. Five Corinthian columns carrying a coffered roof, ivy up three of them, pink-and-black checkered runners, potted palms in white urns, and a beige box running a Botticelli on a CRT. |
| **B — The Mirror of Faces** | noon blue | A perfect reflecting plane under a photographic sky, and rank on rank of hollow circuit-board masks hanging over their own reflections. Most of them are asleep. |
| **C — The Colonnade of Hours** | starfield | A marble checkerboard causeway under rose-stone arches receding to a vanishing point, carrying a longcase clock, an hourglass, and a floor sundial six metres across. |
| **D — The Nexus of Sun and Moon** | the void | A star-shaped platform. A sleeping bronze sun on one column, a runic four-handed moon-clock on the other, the Earth on a marble stair between them, and a golden key lying where someone dropped it. |

![The Mirror of Faces](docs/shots/p3-mirror2.png)
![The Colonnade of Hours](docs/shots/p4-colonnade.png)
![The Nexus of Sun and Moon](docs/shots/p2-nexus.png)

The zones are strung along −Z and joined by colonnade bridges; the sky, fog
and light lerp between presets as you cross, so a bridge reads as a change of
world rather than a cut.

---

## Everything is procedural

No image, model or audio file ships with this game.

**Textures** (`src/core/Assets.js`) are painted into 2D canvases at load:
veined marble via `sin(x + turbulence)` with a domain warp, tiling
checkerboards assembled from rotated marble tiles, solder-mask green with
Manhattan-routed copper and gold pads, verdigris bronze, walnut grain, a
runic dial in Elder Futhark, filled pinnate palm fronds, cumulus skies built
from stacked radial puffs, a magenta-and-green nebula, an Earth with fBm
continents and a separate cloud layer — and the head of Botticelli's Venus,
painted impressionistically, because at 320×240 through a phosphor mask
brushwork is all that survives anyway.

The noise underneath (`src/core/Noise.js`) is seeded and **tileable**: the
lattice period equals the base frequency, which is what makes the marble
seams disappear.

**Geometry** (`src/world/Arch.js`, `src/world/Objects.js`) is built from
first principles: entasis-tapered fluted shafts with analytic normals,
two-tier acanthus capitals with corner volutes and a scooped abacus,
semicircular arcades, and a parametric face mask whose brow, sockets, nose,
cheeks, lips and chin are a field of Gaussians applied to a sphere — with the
eyes punched clean through, which is what makes the things read as hollow
rather than merely blind.

**Audio** (`src/core/Audio.js`) is a small synth: subtractive one-shots for
weapons and impacts, a procedural plate reverb, and a slow detuned
mall-muzak generator — Rhodes-ish FM keys, sub bass, tape wobble — that
pitches *down* with the Chronometer, because the tape slows when time does.

---

## Systems

```
src/
  core/       Config · Time · Input · Audio · Noise · Assets
  render/     Shaders · PostFX · Sky
  world/      Materials · Arch · Objects · Physics · Batch · Level1
  game/       Player · Weapons · Chrono · Enemies · Particles · Pickups · Director
  ui/         HUD · Menu · Console
```

**Physics** (`src/world/Physics.js`) — a deterministic collision world of
boxes, cylinders and spheres in a spatial hash. The player is a vertical
capsule swept in substeps no longer than r/2 (so nothing tunnels) with
step-up support; props are rigid bodies with sleep.

**Movement** (`src/game/Player.js`) — Quake/Source acceleration: project
current velocity onto the wish direction and only add the shortfall. That is
what makes air-strafing feel the way it does, and it was worth preserving.

**Weapons** (`src/game/Weapons.js`) — four, in the 2003 arrangement:

- **Gnomon** — a brass sundial pointer. Melee, arcing cone, never empty.
- **Quartz Pistol** — accurate hitscan, semi-auto, 18-round magazine.
- **Static Repeater** — full-auto, accumulating spread, ejects casings.
- **Chronal Manipulator** — the physics gun. Grab, punt, freeze.

Viewmodels are built from primitives and rendered in their **own scene with
a cleared depth buffer**, so they never clip into the world.

**Enemies** (`src/game/Enemies.js`) — three descendants of the Choir: the
**Wraith** (fast, commits to a lunge), the **Sentinel** (hangs back, lobs
slow orbs you learn to dilate around), and the **Herald**, a three-phase boss
that summons, barrages, and drags a great clock hand around the arena at
ankle height. All of them obey world time.

**Post-processing** (`src/render/PostFX.js`) — the frame renders at ~70%
resolution, is tone-mapped, bloomed *in display space*, then run through one
CRT composite: barrel distortion, per-channel chromatic aberration that grows
toward the corners, a VHS tracking band that tears the scanlines sideways,
an aperture grille computed in **output** pixels, 16-bit quantisation with an
ordered Bayer dither, vignette and grain — plus a chrono grade that pushes
the whole frame amber as time dilates. The low internal resolution is not a
performance concession; 2003 games were soft, and upscaling a 0.7× buffer is
what that softness *is*.

**Static batching** (`src/world/Batch.js`) — the level is thousands of small
meshes: fluted shafts, acanthus leaves, balusters, keycaps, ivy. After
assembly each zone is walked, every static mesh's transform baked into its
geometry *in zone-local space*, and the results merged by material. Draw
calls went from ~3,150 to ~215.

---

## Developer console

Press **`**. `help` lists everything. Every cvar in `Config.js` is settable
by name.

```
noclip · god · give all · spawn sentinel 3 · goto nexus · stage 12
hour 11 47 · hourrate 4 · timescale 0.2 · fps · stat · save · load
r_scale 0.5 · r_crt 0 · r_chroma 2 · m_sensitivity 0.003
```

---

## Status

Chapter One is complete and playable start to finish: twenty-one scripted
stages, four weapons, three enemy types, a boss, checkpoints, autosave,
closed captions, and an options menu that exposes every knob on the CRT.

*Chapter Two — THE GARDEN OF FORKING CLOCKS — was never built.*
