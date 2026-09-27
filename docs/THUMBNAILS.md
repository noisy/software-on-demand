# BUILDERS — thumbnail brief

We need **~30 thumbnail candidates** (the client picks one) for the video on YouTube / X. A thumbnail is a **designed
composition**, not a frame grab: one staged 3D hero shot built from your plate's own geometry and shaders, a bold
headline, strong contrast. Same visual system as the video (`docs/TREATMENT.md`: palette, grain, bloom, fonts, the
gold cursor), so every candidate looks like it belongs to this film.

## Output

- 16:9. Laid out in the engine's 1920×1080 logical space, exported at `--scale 2` (3840×2160) and downscaled to
  **1280×720** (`out/thumbs/A<n>-<k>.png`). Also check it at **320×180** (the size people actually see it at).
- Each slot is a timeline entry (`src/timeline.ts`): author n owns `app/src/scenes/thumb-a<n>.ts` (one module; `ctx.params.k` = 1..5 selects
  the design) and may add helpers `thumb-a<n>-*.ts`. Slot k of author n spans `THUMB_T(n,k) = 400 + (n-1)·20 + (k-1)·2` to +2 s;
  render the still at **THUMB_T(n,k) + 1**. Import your plate's kits/geometry freely (read-only: don't edit plate files).
- A still is a single sample: use `--samples 12` for AA (a still has no motion blur). Make it deterministic.

## What makes it work at 320×180

- **One focal object**, large, lit, with a clear silhouette (the gold cursor/weld point is a great eye magnet). Depth: a
  foreground, the hero, a darker background. No busy full-frame texture behind the type.
- **Headline: 2–5 words**, Archivo 900 (width 62–100), huge (150–260 px in the 1920 layout), 1–3 lines, **one or two words in
  gold**, the rest bone. Use `headline()` from `app/src/scenes/_thumb.ts` (also `kicker()` for a small mono line and `wordmark()`
  for the BUILDERS mark). Max 2 type sizes per thumbnail. The headline must read at 320×180: check it.
- Contrast: ink/cobalt backgrounds, gold + bone foreground, bloom only on gold. Keep the palette (no new hues).
- **Safe zones**: keep type and the hero's key parts ≥ 72 px from the edges and **out of the bottom-right 330×130 px**
  (YouTube's timestamp badge). `safeGuides()` draws them for checking (never leave them in).
- No faces (faceless figures/silhouettes are fine), no emoji, no clickbait arrows/circles, no fake UI of real products.
- Variety across your five: different compositions (headline left / right / top / centred-over-object), different camera
  distances (macro, hero 3/4, wide), ink vs cobalt, headline vs no-headline (≤ 1 of 5 without a headline).

## Concepts per author (starting points — improve them; slot 5 is your own best idea)

| author | plates | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| A1 | open, boot | voxel BUILDERS mid-slam, gold blocks flying (headline may be the title itself) | the cursor at `> build me the future`, blocks launching — "JUST TYPE IT." | Clarke's words in the 3D corridor — "INDISTINGUISHABLE FROM MAGIC" | the block city, one gold tower rising — "EVERYONE CAN BUILD NOW" |
| A2 | oldworld, glass | the glass tower shattering, gold strike — "BREAK THE GLASS" | lobby signs STUDIO / LABEL struck in gold — "NO STUDIO. NO LABEL." | cobalt blueprint pyramid of 100 badges — "IT USED TO TAKE 100 PEOPLE" | the faceless artist walking out of the tower into gold light — "WALK OUT. BUILD." |
| A3 | jevons, niche | the engraved bell ringing, the demand line shooting up — "JEVONS WAS RIGHT" | the price tag tearing $1,000,000 → $1 — "SOFTWARE GOT CHEAP" | the dot-map with lit niche pins — "EVERY NICHE IS WORTH IT" | the engraved steam engine + governor — "THE COAL QUESTION, 2026" |
| A4 | hook ×3 | the builder with a thousand arms unfolding — "ONE MIND. 1,000 HANDS." | the planet of builder lights — "SOFTWARE ON DEMAND" | the magic circle + wand drawing — "YOU’RE THE WIZARD NOW" | the tower of sung words — "JUST SAY IT." |
| A5 | internals, machine | the ladder of abstraction, ENGLISH on top — "WE STOPPED READING CODE" | attention arcs over the token row — "WEIGHTS & ATTENTION" | the GPU die macro, gold wavefront — "HOW THE MAGIC WORKS" | next-token bars, "demand" winning — "SOFTWARE ON ___" |
| A6 | longtail, outro | the lit long-tail landscape to the horizon — "THE LONG TAIL IS OPEN" | the cobalt title block `DRAWN BY: EVERYONE` — "DRAWN BY: EVERYONE" | the callback tunnel — "THE ONE-PERSON STUDIO" | the final block-built SOFTWARE ON DEMAND — (headline is the object) |

Useful copy you may use instead: "EVERYONE’S A BUILDER", "SOFTWARE ON DEMAND", "JUST SAY IT.", "ANY SUFFICIENTLY ADVANCED TECH…",
"ONE PERSON. ONE AFTERNOON.", "THE BUILDERS ERA", kicker lines like `A SONG FOR BUILDERS` / `A SONG ABOUT SOFTWARE ON DEMAND`.
