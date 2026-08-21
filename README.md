# SILICONE DREAMS — Level One

A first-person immersive sim for a Source engine that never shipped.

**SILICONE DREAMS** is a vaporware immersive sim: a recovered 2003-era
prototype about classical marble with silicon growing through it. You wake in
an octagonal atrium whose grout is a live circuit, with six gates out of it
and a hall of empty vitrines waiting to be filled. It runs in a browser with
no build step and no downloaded assets — every texture, model, sound and note
in it is generated at load time from code.

![The Atrium of Sleeping Machines](docs/shots/final-atrium.png)

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
| **Tab** | journal — objectives and field notes |
| **E** | use / take |
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

## The hub

**THE ATRIUM OF SLEEPING MACHINES** is built from nothing — none of the
reference plates are of this place, because this is where you keep the things
you take from them.

An octagonal marble hall, sunk in the middle with a brass orrery that turns
and keeps the wrong time. Eight bays: six gates out to the level's sections,
one workshop and long desk of period terminals, one opening onto the **Vitrine
Hall** — a barrel-vaulted gallery of reliquary plinths that fill as you
recover relics. A balcony tier above carries eight more portals, one per
future chapter, sealed and labelled until someone builds behind them.

Everything is diegetic: the save point is a chronometer you wind, the upgrade
screen is a bench you stand at, the collection screen is a room you walk down.

![The Vitrine Hall](docs/shots/v-hall.png)

To ship a new level, add it to `CHAPTERS` in `src/world/Hub.js` and point its
portal at a destination. The geometry, the labels, the locks and the Vitrine
Hall's length all read from that list — the hall sizes itself from the relic
registry, so ten more relics get ten more plinths and a longer nave.

---

## The sections

Each is a reconstruction of one reference plate.

| Zone | Plate | What it is |
|---|---|---|
| **A — The Terminal Temple** | violet dusk | A white marble plaza on a violet sea. Five Corinthian columns carrying a coffered roof, ivy up three of them, pink-and-black checkered runners, potted palms in white urns, and a beige box running a Botticelli on a CRT. |
| **B — The Mirror of Faces** | noon blue | A perfect reflecting plane under a photographic sky, and rank on rank of hollow circuit-board masks hanging over their own reflections. Most of them are asleep. |
| **C — The Colonnade of Hours** | starfield | A marble checkerboard causeway under rose-stone arches receding to a vanishing point, carrying a longcase clock, an hourglass, and a floor sundial six metres across. |
| **D — The Nexus of Sun and Moon** | the void | A star-shaped platform. A sleeping bronze sun on one column, a runic four-handed moon-clock on the other, the Earth on a marble stair between them, and a golden key lying where someone dropped it. |
| **E — The Cortex Engine** | the wired brain | A brain the size of a hill in a red corona: pink flesh on one side, blue-grey and stapled on the other. Ribbed insulator stacks throw arcs across the route, twin triodes burn orange, a hazard-striped ACCESS panel is the way home, and a red LED timer reads 0123 / REC ON — the only clock in the level telling the truth. You cross it on membrane catwalks, surgical staples bridging the sulci, and a coiled handset cord you walk up. |
| **F — The Altar of Ascending Binary** | the reliquary | A plain of dark volcanic rock under an indigo sky, an avenue of lesser reliquaries, and a monolith with the oil-slick brain turning over its mercury dish, pouring chrome ones and zeroes into the air. |

![The Mirror of Faces](docs/shots/p3-mirror2.png)
![The Colonnade of Hours](docs/shots/p4-colonnade.png)
![The Nexus of Sun and Moon](docs/shots/p2-nexus.png)
![The Cortex Engine](docs/shots/c-ext.png)
![Grafted hardware](docs/shots/c-tubes.png)
![The Altar of Ascending Binary](docs/shots/a-approach.png)

The four original sections are strung along −Z and joined by colonnade
bridges; the sky, fog and light lerp between presets as you cross. The two new
sections sit on their own islands of space, reached through the atrium's
gates. Section roots and their lights are culled by distance, because a
corona the size of the Cortex's is visible from four hundred metres away.

---

## The pickup grammar

The second plate is not just a place, it is a **grammar**, and the game uses
it everywhere:

> a black monolith wrapped in green circuit traces and jewelled components, a
> dish of standing mercury set into its crown, a column of vapour rising off
> it, the object turning slowly in the air above, and a stream of chrome ones
> and zeroes climbing out of it and going out like sparks.

Every relic in the world appears that way. Every vitrine in the hub is the
same object with an empty slot. The altar at the end of the level is the same
thing built forty times bigger. Read it once and you can read it anywhere.

![A relic on its plinth](docs/shots/relic-02.png)

---

## Immersive sim

- **Sixteen relics**, each a built model with a name and a line of lore, each
  with a labelled plinth waiting in the Vitrine Hall.
- **Examination** — hold an object up and turn it over while the game goes
  quiet, rendered in the viewmodel scene so it never clips the world.
- **Inventory** of sigils and tools; the six gates read what you are carrying.
- **A journal** of objectives and field notes, written as you find things.
- **A hub that is a UI** — wind the chronometer to save, stand at the bench to
  spend, walk the hall to see what you have.

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

**Post-processing** (`src/render/PostFX.js`) — the CRT layer is seasoning,
not the meal. The frame renders at **native resolution with 4× MSAA**, is
tone-mapped, bloomed *in display space*, then run through one CRT composite
with everything turned down to **0.15**: a whisper of curvature (with
compensating overscan, so it never shows a black frame), per-channel
chromatic aberration, an aperture grille computed in output pixels, a light
ordered dither whose level count scales with the slider, vignette and grain —
plus a chrono grade that pushes the frame amber as time dilates. Every one of
those is exposed in Options.

**Static batching** (`src/world/Batch.js`) — the world is thousands of small
meshes: fluted shafts, acanthus leaves, balusters, keycaps, ivy, sixteen
reliquary plinths. After assembly each zone, the hub, the Cortex and the
Altar are walked, every static mesh's transform baked into its geometry *in
zone-local space*, and the results merged by material. Combined with distance
culling of section roots and of the point lights parented to the scene root,
draw calls in the atrium went from ~3,150 to ~400.

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

Level One is playable start to finish. You wake in the atrium, take the
gnomon off the bench, and go out through whichever gate you can open. Six
sections, sixteen relics, four weapons, three enemy types, a boss, three time
powers, checkpoints, autosave, closed captions, a journal, and an options
menu that exposes every knob on the CRT.

**Not yet built:** the workshop bench accepts silicone but has no upgrade
list behind it; the long desk's terminals are set dressing rather than
readable; and the Cortex's lamp-row sequence and the multi-route bypasses are
scaffolded but not wired to locks.

*LEVEL TWO — THE GARDEN OF FORKING CLOCKS — was never compiled.*
