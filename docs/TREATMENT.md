# BUILDERS — treatment & style bible

Song: "Builders" (Suno v6-mini, 184.76 s, ~123 BPM, one bar ≈ 1.94 s). Engine: forked from pdoom-video (MIT), see `docs/ENGINE.md`.
Data: `data/lyrics.json` (word-level, CTC-aligned), `data/audio.json` (beats, downbeats, sections, envelopes, kick/snare/hat/vocal onsets).

## The idea in one paragraph

The whole video is **one continuous act of construction**. Everything on screen is being typed, drawn, extruded, welded, assembled or compiled while we watch, by one tool: **the cursor** — a gold insertion caret with a white-hot tip. It types the first word, draws the first line, extrudes type into 3D, welds the builder's workbench, rides the loss curve, strikes out the gatekeepers, cracks the glass, and at the end is revealed as the magician's **wand** ("Any sufficiently advanced technology is indistinguishable from magic"). Every plate is a different **builder's idiom** — terminal, cyanotype blueprint, engraved machinery, CAD wireframe, a model-maker's city, an orbital chart, a technical cutaway, a spellbook's geometry — but all share one palette, one type system, one grain, one camera language, one sense of optimism. Subjects are concrete objects (a key, a block, a tower, a calendar, a flywheel, a bell, a workbench, arms, a transformer block, a token, a compiler, a globe, a GPU die, a loss landscape, a glass wall, a gate, a wand) treated as **transformations and visual puns**, never as literal storyboard illustrations of each line.

## Tone & motion (the most important section)

- **Nothing sits still. Ever.** No plate holds a composition for more than ~one bar (1.94 s) without a sub-cut, a reframing, or a strong camera move. Titles and key objects are on screen for seconds, not tens of seconds. Build the energy of the edit on the song: sub-cuts on downbeats, hits on kicks and snares, camera moves that ease *into* downbeats, snaps on vocal onsets.
- **3D first.** Every plate lives in a 3D world with a moving camera (dolly, crane, orbit, whip-pan, crash-zoom, roll, fall). 2D material (type, UI, charts, blueprints) is placed **on planes in 3D** — tilted, parallaxing, flown past, flown through — never a flat static card. Use three.js geometry, instancing, raymarched SDFs, GPU line batches (`LineBatch` 3D mode) and engraving/hatch shading.
- **Morph, don't just cut.** Plates hand over through a shared object or shape (the cursor, a line, a block, a grid, a light) — see "Handoffs" per plate. Hard cuts are fine on downbeats, but the first frame of a plate must visually continue something from the last frame of the previous one.
- Strong eases (`ease.outExpo`, `inOutCubic`, springs): anticipation → snap → settle. No floaty screensaver drift, no generic particle nebulae.
- Optimistic, precise, a little witty (deadpan mono footnotes, drawing annotations, tolerance callouts, part numbers). Impressive, not cute. No mascots, no emoji, no faces (human figures are simple faceless silhouettes or line figures).
- Not slop: **no synthwave sunsets/grids, no purple/cyan neon, no glowing brains, no Matrix rain, no robots with faces, no lens-flare soup, no stock "AI" imagery**. Nothing that looks AI-generated. Don't copy pdoom-video's plates or motifs (spark/fuse, mask, P(doom), shoggoth, prompt+probability template): we reuse its engine, not its ideas.

## Palette (`app/src/engine/palette.ts`) — nothing else, anywhere

- **ink** `#08090B` background, **ink2** `#141619` panels, **graphite** `#565B63`, **ash** `#9AA0A8`, **bone** `#ECEAE4` type/lines, **signal** `#FFB020` molten gold (the cursor, the sung word, weld sparks, what is being built right now), **ember** `#FFE3A0` white-hot cores, **blood** `#A34E00` rust shadows of gold.
- **cobalt** `#0E2A6E`: cyanotype blueprint paper, with bone lines on it. Used by the "plans" plates (old world, the tower again in the bridge, the ladder/compiler floors if you like, the end title block). It gives the edit a light/dark rhythm: ink ↔ cobalt. Gold stays gold on both.
- Only signal/ember may exceed ~0.85 linear (i.e. bloom). Bone type stays crisp.
- GLSL: `C_INK, C_INK2, C_GRAPHITE, C_ASH, C_BONE, C_SIGNAL, C_EMBER, C_BLOOD, C_COBALT`. TS GL: `LIN.x`; Canvas2D: `rgba('x', a)`.

## Typography

- **Archivo** (width 62–125, weight 300–900): the voice of the lyrics. Big, tight, confident; animate width/weight for expression (stretch on held notes, condense under pressure, extrude to 3D).
- **IBM Plex Mono**: the machine — terminal, tokens, code, labels, part numbers, footnotes, counters.
- **Cormorant Garamond** (italic): the magic register, rarely: Clarke's quote, "wizard", the very end.
- **Single-stroke fonts** (`stroke.ts`) for text *written* by the cursor/pen/wand.
- Swiss-grid discipline, asymmetric compositions, hairline rules, small mono annotations next to big display type. Kerning via `layout()`/`glyphX()`. Typographic punctuation. No outlined or haloed type.

## Lyrics: always on, always integrated, timed in different ways

Every sung word of the song is on screen, **exactly in sync** (appear/highlight at `start`, complete by `end`; anticipation ≤ 0.4 s allowed, never run ahead of the voice). But the video is not "a video with lyrics": each plate stages its lines **inside the image, with intention**, and every plate uses a **different timing idiom**. Use these (and invent more):

1. **Typed** — per character, keystroke by keystroke across the word's duration (terminal, forms).
2. **Pen-written** — single-stroke text whose written length follows `writtenLength(st, charTimes, t)`, the cursor as the pen.
3. **Stamped / slammed** — each word lands whole at its onset with a hit (scale snap, shake, dust), one word per hit.
4. **Built** — letters assembled from blocks/voxels, extruded or welded on syllables; the word finishes as it ends.
5. **Riding** — text on a path (a curve, an orbit, a loss curve, a road), advancing as sung.
6. **Wiped** — per-glyph sweep via `Lyrics.lineCharProgress`, gold for sung, 30–40 % bone for unsung.
7. **Structural** — each word is a physical part of the scene (a floor of a building, a token in a sequence, a pin on a map, a sign on a tower, a shard of glass).
8. **Held** — long notes stretch the glyphs (Archivo width 62 → 125) for the word's duration.

Readability first: every line must be readable at 1080p, inside title-safe (≥ 96 px from edges). Default emphasis: sung portion in gold or bone, unsung in ~30–40 % bone. Find lines by content through the `Lyrics` API (`lyrics.get('a tower and a name')`), never hard-code times.

## Motifs (shared helpers in `app/src/scenes/_motifs.ts`)

1. **The cursor** — `cursorCaret`, `cursorTip`, `cursorBlink(f.beatPhase)`, `weldSparks`. Appears in most plates as the thing that makes: typing caret, pen, weld point, the tip of the demand line, the striking line, the crack's origin, the wand's tip.
2. **Blocks** — gold/bone unit cubes (building material). Letters and structures are assembled from them (boot title, the builder's words, the long tail's tiny structures, the outro).
3. **The tower** ("BIG SOFTWARE CO.") — a tall glass slab with a crown sign. Built in verse 1 as a blueprint; returns in the bridge as real glass and is broken. Same geometry both times (owner: oldworld + glass).
4. **The long tail** — the demand curve `h(i) ∝ 1/(1+i·k)^a`: a few tall "head" structures and thousands of tiny ones stretching to the horizon. Dim and rained-on in verse 1; lit wave by wave in the first instrumental; each niche a lit point in pre-chorus 2.
5. **The hook** — "software on demand." closes every chorus: one recurring typographic slam, **SOFTWARE / ON / DEMAND one word per sung word**, whose look escalates: (1) bone on ink, clean, extruded; (2) gold on ink in orbit, heavier; (3) the spell: gold sigil geometry, maximal; (outro) everything at once.

## Plates (scene modules) — windows from `src/timeline.ts`

| id | window (s) | lyric | owner |
|---|---|---|---|
| `open` | 0 – 12.10 | Any sufficiently advanced technology is indistinguishable from magic. (spoken) | A1 |
| `boot` | 12.10 – 27.79 | (instrumental build) | A1 |
| `oldworld` | 27.79 – 41.52 | It used to take a hundred hands, / a tower and a name, / a year of meetings for a feature, / while the long tail waited in the rain. | A2 |
| `jevons` | 41.52 – 51.29 | Then the cost of making fell, / and Jevons rang the bell. | A3 |
| `hook1` | 51.29 – 64.85 | Now everyone's a builder, / one mind, a thousand hands. / Just say it, and it's standing: / software on demand. | A4 |
| `longtail` | 64.85 – 76.42 | (instrumental) | A6 |
| `internals` | 76.42 – 90.50 | Made of weights and attention, / trained on tokens through the night. / Once we trusted the compiler, / now we trust the words we write. | A5 |
| `niche` | 90.50 – 99.41 | Every niche and every dream, / now it's worth the machine. | A3 |
| `hook2` | 99.41 – 112.78 | Now everyone's a builder, / one mind, a thousand hands. / Just say it, and it's standing: / software on demand. | A4 |
| `machine` | 112.78 – 129.92 | (instrumental: 112.8–116.6 high energy, 116.6–124.2 breakdown, 124.2–129.9 build) | A5 |
| `glass` | 129.92 – 144.78 | No studio, no label, / no gate you have to pass. / The artist left the tower, / the builder breaks the gl— (the shatter lands on "glass", 144.78) | A2 |
| `hook3` | 144.78 – 162.59 | (…glass.) / Now everyone's a builder, / a wizard with a plan. / Just say it, and it's standing: / software on demand. | A4 |
| `outro` | 162.59 – 184.76 | (loud instrumental) … Software on demand. (169.33) … (fade) | A6 |

### `open` — "The quote, flown through" (A1)
Black. The cursor blinks alone on the downbeats (one bar), then Clarke's sentence is **pen-written / typed word by word as spoken**, in Cormorant italic, not as a centred subtitle: each word sits on its own plane in a 3D corridor, and the camera dollies forward through the sentence, passing each word as it is spoken (depth of field feel through scale/alpha; slight roll). "magic." — the cursor tip flares, the word turns gold, weld sparks. A tiny mono attribution `— Arthur C. Clarke, 1973 ("Profiles of the Future", rev. ed.)` types itself. Last ~0.5 s: the camera pulls back fast; the sentence collapses into a single terminal line with the cursor at its end. **Handoff → boot**: the cursor, same screen position.

### `boot` — "Hello, builder" (A1)
Energy rising for 15.7 s: this plate must move fast. The terminal line becomes a prompt `> build`; each keystroke (on 8ths/kicks) spawns **blocks** that fly in and snap together in 3D; the blocks assemble the word **BUILDERS** in voxels bar by bar, the camera orbiting and crash-zooming. The big downbeat at ~17.99 s: the title completes with a slam (flash, shake, dust of blocks), then within ≤ 2 bars it is already transforming: the camera flies *through* the letters (sub-cut every bar: through the B's counter, low angle along the baseline, top-down), the voxels re-stack into a skyline of grey blocks — the old world's corporate towers. Mono annotations throughout (block count, `compile 0.18 s`, coordinates). **Handoff → oldworld**: in the last beat the grey towers flip to bone-on-cobalt blueprint outlines.

### `oldworld` — "Plans, as they used to be drawn" (A2)
Cyanotype: **bone lines on cobalt paper**, blueprint conventions (dimension lines, hatching, section marks, title blocks) — but in 3D, camera moving through the drawing.
- "It used to take a hundred hands," — a 3D **org chart pyramid** of 100 small hand glyphs / badge cards (instanced), the camera craning up it; words stamped in the org boxes as sung ("hundred" on the 100th box).
- "a tower and a name," — the pyramid folds up into **the tower** (blueprint wireframe extruding floor by floor); the lyric runs up the façade as signage; "name" = the crown sign BIG SOFTWARE CO. lights.
- "a year of meetings for a feature," — the façade's windows become **calendar cells** flipping like a split-flap board; 12 months rush past; the words are typed into a meeting invite plane; `FEATURE #4127 — 3 %` crawls.
- "while the long tail waited in the rain." — the camera drops down the tower to street level: **the long tail** as a row of tiny unbuilt plots/huts shrinking to the horizon, **rain** (line streaks) falling; the words written on the wet ground, reflected.
**Handoff → jevons**: the rain streaks decelerate and become the vertical grid lines of jevons' chart (end on vertical lines).

### `jevons` — "The cost of making" (A3)
Ink plate, **engraved machinery** (hatch shading): a 3D steam engine flywheel & centrifugal governor spinning (William Stanley Jevons, *The Coal Question*, 1865 — more efficient engines → more coal burned). The **cost curve** plunges; "Then the cost of making fell," — the word FELL literally falls down the curve (riding), the price tag dropping in digits (`$1,000,000 → $1,000 → $1`). "and Jevons rang the bell." — an engraved **bell** swings in 3D and **rings on "bell"** (shockwave rings, shake, flash); on the ring the **demand line** shoots straight up past the frame, the camera riding it vertically. Footnote in mono: `Jevons paradox: cheaper → far more of it`. **Handoff → hook1**: a vertical gold line (the demand line = the cursor) plunging down onto the workbench.

### `hook` ×3 — "Everyone's a builder" (A4) — params `{n: 1|2|3}`
One recurring chorus template, escalating. Four sub-sections per chorus, one per line, each with sub-cuts on the beat:
1. **"Now everyone's a builder,"** — BUILDER assembled from **blocks**, letters dropping in on syllables, welded by the cursor (weld sparks), camera orbiting; one faceless builder figure at a workbench.
2. **"one mind, a thousand hands."** — from the one figure, **a thousand hands/robot arms** (instanced articulated arms, line-drawn) unfold radially on 16ths; mono counter `× 1,000`.
3. **"Just say it, and it's standing:"** — the sung words literally **stand up**: each word becomes a floor of a building extruding upward as it is sung (structural karaoke); "standing" tops it out.
4. **"software on demand."** — THE HOOK slam (see Motifs 5).
Variants: **n=1** the workbench (ink, bone, gold; clean). **n=2** a planet of builders: an engraved night-side globe; lights ignite in waves = builders; the thousand hands = a thousand satellites; the words orbit on a ring; hook in orbit. **n=3** the magician: begins with the glass shards of the bridge flying out and becoming the segments of **magic circles** (sigil rings of code glyphs `{} <> λ Σ ∫ →`, Plex Mono, rotating in 3D), "a wizard with a plan" — the cursor is now a **wand** drawing a blueprint in light (single-stroke), maximal hook; also show "glass." finishing (the held word) as shards at the very start.
**Handoffs**: hook1 → longtail: the DEMAND slam's letters shatter into thousands of small lit blocks that stream along a long curve. hook2 → machine: the satellites converge into a grid → the GPU die. hook3 → outro: the magic circle collapses to the cursor.

### `longtail` — "Finally worth building for" (A6) (instrumental, 11.6 s)
A fast, banking **fly-over** of the long-tail landscape at dusk (3D): thousands of tiny structures stretching to the horizon, lighting up gold **in waves on each beat**, the camera racing low along the curve then pulling up to reveal its length. Mono counters and callouts (`needs served 6 → 10,000`, `market size: too small (1999)` struck out → `worth it (2026)`). Sub-cuts every bar (low chase, top-down, crane-up, whip). **Handoff → internals**: the camera pulls up until the lights compress into a regular grid of dots — the nodes of a network.

### `internals` — "What it is made of" (A5)
For AI enthusiasts; precise technical cutaways, engraving hatch, mono labels. Ink plate.
- "Made of weights and attention," — a 3D **transformer block cutaway** (embeddings, attention heads, MLP, residual stream), weights as hatched matrices; the sung words enter as **tokens**, and **attention arcs** connect the currently sung word back to previous words (arc height/brightness = weight) — the lyric *is* the token sequence.
- "trained on tokens through the night," — a river of tokens streaming under a night sky into the model; the **loss curve** drawn by the cursor, descending; the words ride the curve; `step 1,204,000`.
- "Once we trusted the compiler," — **the ladder of abstraction**: a vertical 3D stack of floors (TRANSISTORS die → MACHINE CODE → ASSEMBLY → C → PYTHON → ENGLISH); the camera rises one floor per beat; each word is set on its floor in that floor's language (e.g. `compiler` in C, `MOV` hex below).
- "now we trust the words we write." — top floor ENGLISH: the words typed as a plain sentence; on "write" the sentence compiles *down* through every floor (a flash) and a small app assembles from blocks.
**Handoff → niche**: the finished app drops like a pin onto a map.

### `niche` — "Every niche" (A3)
A **map table / globe of dots** in 3D (bone dots on ink); "Every niche and every dream," — pins drop on the sung words; each pin sprouts a tiny labelled model (a bakery rota, a harbour tide chart, a choir's sheet music, a village walk map…), dozens more on the beats; "now it's worth the machine." — a GPU rack / server slides in on "machine" and its fans spin; the lyric set as a price/value comparison label. **Handoff → hook2**: the camera dives toward one light on the map, which becomes the first light on the planet.

### `machine` — "How the magic works" (A5) (instrumental, 17.1 s)
Three movements with sub-cuts: **(a) 112.8–116.6 GPU die**: a macro fly-over of a chip, tiles computing a matrix multiply (gold pulses on kicks), `FLOP/s` counter. **(b) 116.6–124.2 breakdown — gradient descent**: a 3D contour-line loss landscape (engraving), a bead rolling down into the valley, slow and beautiful, mono annotations of the gradient. **(c) 124.2–129.9 build — next token**: `software on ___` with next-token bars climbing (demand 0.93, time 0.03, …), rising with the build; the winning bar goes white-hot. **Handoff → glass**: the white-out settles into the cobalt night.

### `glass` — "The builder breaks the glass" (A2)
The tower returns — now real **glass** (3D, reflections, night, cobalt sky) with signs on its lobby. "No studio, no label," — signs STUDIO, LABEL (and PUBLISHER, GATEKEEPER in small) get **struck through by the gold cursor line** on the sung words. "no gate you have to pass." — a turnstile/gate in front swings open on "pass". "The artist left the tower," — a lone faceless figure walks out, the camera tracking with them. "the builder breaks the glass." — cracks race from the cursor tip across the glass, growing with each word; **shatter exactly on "glass" (144.78)** = the cut. **Handoff → hook3**: shards flying toward camera.

### `outro` — "Software on demand" (A6)
162.6–169.3: rapid callback montage — on each beat a key object from an earlier plate flies past in a tunnel (a block, the tower, the bell, the flywheel, a token, the globe, the GPU die, a shard, a sigil), accelerating. 169.33: **"Software on demand."** — the final, biggest hook. ~172 → end: a blueprint **title block** on cobalt, like an engineering drawing's: `BUILDERS · DRAWING NO. 001 · SCALE 1:1 · DRAWN BY: EVERYONE · CHECKED: — · DATE: 2026`, "Everyone can be a builder now." in Archivo, credits in mono (`Music & vocals: Suno · Lyrics & video: made with Claude Code · Engine: pdoom-video by mexicat (MIT)`), the cursor blinking to the last beat; fade.

## Technical conventions

See `docs/ENGINE.md` (read it fully). Deterministic (pure function of `f.t`), per-word sync, beat-synced motion, cuts on downbeats. Performance: < 40 ms/frame at 1 sample. Check your work with stills and contact sheets and LOOK at them.

## Appendix: sections and lyric timings (from data/)

| section | window |
|---|---|
| intro | 0.00 – 12.10 |
| build | 12.10 – 27.79 |
| verse1 | 27.79 – 41.52 |
| pre1 | 41.52 – 51.29 |
| chorus1 | 51.29 – 64.85 |
| inst1 | 64.85 – 76.42 |
| verse2 | 76.42 – 90.50 |
| pre2 | 90.50 – 99.41 |
| chorus2 | 99.41 – 112.78 |
| inst2 | 112.78 – 129.92 |
| bridge | 129.92 – 144.78 |
| chorus3 | 144.78 – 162.59 |
| outro | 162.59 – 184.76 |

| # | section | start | end | line |
|---|---|---|---|---|
| 0 | intro | 4.64 | 11.38 | Any sufficiently advanced technology is indistinguishable from magic. |
| 1 | verse1 | 28.14 | 31.12 | It used to take a hundred hands, |
| 2 | verse1 | 31.25 | 33.63 | a tower and a name, |
| 3 | verse1 | 34.91 | 36.97 | a year of meetings for a feature, |
| 4 | verse1 | 38.03 | 41.38 | while the long tail waited in the rain. |
| 5 | pre1 | 42.68 | 45.51 | Then the cost of making fell, |
| 6 | pre1 | 46.71 | 50.18 | and Jevons rang the bell. |
| 7 | chorus1 | 52.00 | 53.56 | Now everyone's a builder, |
| 8 | chorus1 | 55.49 | 57.63 | one mind, a thousand hands. |
| 9 | chorus1 | 59.23 | 61.80 | Just say it, and it's standing: |
| 10 | chorus1 | 62.60 | 64.26 | software on demand. |
| 11 | verse2 | 76.82 | 79.58 | Made of weights and attention, |
| 12 | verse2 | 79.67 | 82.37 | trained on tokens through the night. |
| 13 | verse2 | 83.33 | 85.35 | Once we trusted the compiler, |
| 14 | verse2 | 86.23 | 89.88 | now we trust the words we write. |
| 15 | pre2 | 91.10 | 94.57 | Every niche and every dream, |
| 16 | pre2 | 94.81 | 97.06 | now it's worth the machine. |
| 17 | chorus2 | 100.06 | 101.70 | Now everyone's a builder, |
| 18 | chorus2 | 103.59 | 105.73 | one mind, a thousand hands. |
| 19 | chorus2 | 107.27 | 110.22 | Just say it, and it's standing: |
| 20 | chorus2 | 110.56 | 112.76 | software on demand. |
| 21 | bridge | 131.04 | 134.55 | No studio, no label, |
| 22 | bridge | 134.85 | 137.47 | no gate you have to pass. |
| 23 | bridge | 138.63 | 142.64 | The artist left the tower, |
| 24 | bridge | 142.72 | 146.00 | the builder breaks the glass. |
| 25 | chorus3 | 147.64 | 149.18 | Now everyone's a builder, |
| 26 | chorus3 | 151.51 | 153.11 | a wizard with a plan. |
| 27 | chorus3 | 154.73 | 157.69 | Just say it, and it's standing: |
| 28 | chorus3 | 158.04 | 160.94 | software on demand. |
| 29 | outro | 169.33 | 171.60 | Software on demand. |
