# Software on Demand — "Builders", a code-rendered music video

[![Software on Demand: The New Era Has Started](https://img.youtube.com/vi/KrGHt7nogz8/maxresdefault.jpg)](https://youtu.be/KrGHt7nogz8)

**Watch it on YouTube: https://youtu.be/KrGHt7nogz8**

A 3-minute music video about the new era of software on demand: making software got so cheap that one person can
now build what used to need a team, a tower and a year of meetings, and (Jevons' paradox) that means far *more*
software, all the way down the long tail of niches nobody could afford to serve before.

No video editor and no stock footage: every frame is a deterministic function of song time, drawn in the browser with
three.js / WebGL and rendered offline to 1080p60 with motion blur. The lyrics are on screen for the whole song, synced
word by word to the vocal, and staged differently in each scene: typed, stamped, built from blocks, cast into a bell,
riding the loss curve, one floor per language on the ladder of abstraction, struck through on the lobby signs.

The video was made with Claude Code (Opus 5.5): the lyrics, the treatment and style bible, the lyric alignment and
audio analysis, the 13 scenes, the thumbnails and the renders were all worked out in conversation with Claude.

## Credits

- **Wizard / Builder:** [youtube.com/@noisycoder](https://www.youtube.com/@noisycoder)
- **Wand:** [NoisyStudio.ai](https://noisystudio.ai)
- **Music & vocals:** generated with [Suno](https://suno.com) from our lyrics.
- **Lyrics & video:** made with Claude Code, Opus 5.5.
- **Engine:** the renderer is a fork of [**pdoom-video**](https://github.com/mexicat/pdoom-video) by
  **Giacomo Magnanini ([@mexicat](https://github.com/mexicat))**, the code-rendered video for "I'm Upping My P(doom)".
  Huge thanks: its timeline engine, post-processing (bloom, halation, grain), adaptive motion-blur sampler, GPU line
  batches, typography and single-stroke fonts, and its approach to word-synced lyrics (Demucs stems + CTC forced
  alignment) are what made this video possible. If you like this one, go watch
  [that one](https://www.youtube.com/watch?v=5EoO5413dBY).
- **Inspiration:** [James Douma](https://x.com/jamesdouma/status/2084155089963635085), on no longer reading the source
  code, the way we once stopped reading the assembly because we trusted the compiler. That thought became the second
  verse ("Once we trusted the compiler, / now we trust the words we write").

## Layout

- `audio/builders.mp3` — the song (Suno).
- `data/lyrics.json` — word-level lyric timings; `data/audio.json` — tempo (~123 BPM), beats, downbeats, sections,
  kick/snare/hat/vocal onsets and loudness envelopes of the stems.
- `analysis/` — the Python pipeline that produced them (`run.sh`): Demucs stem separation, a Whisper pass to find the
  sections, CTC forced alignment of the known lyrics (wav2vec2), beat/onset analysis, export in the engine's format.
- `app/` — the renderer: TypeScript + three.js, bun + Vite (engine in `src/engine/`, one module per scene in
  `src/scenes/`, the edit in `src/timeline.ts`, offline renderer in `scripts/render.ts`).
- `docs/TREATMENT.md` — concept, style bible and scene-by-scene treatment; `docs/ENGINE.md` — the engine and scene API;
  `docs/THUMBNAILS.md` — the thumbnail brief (the thumbnails are scenes too: `src/scenes/thumb-a*.ts`).

## Preview and render

Requirements: [bun](https://bun.sh), Google Chrome and ffmpeg (with libx264).

```sh
cd app
bun install
bunx vite            # preview at http://localhost:5173 (space = play, ←/→ seek, [ ] scenes, ?t=90 to start at 1:30)
```

Offline render (1920×1080, 60 fps, adaptive motion blur), against a dev server without live reload:

```sh
cd app
PDOOM_NO_HMR=1 bunx vite --port 5191 --strictPort &
bun scripts/render.ts video --samples auto --max-samples 108 --shutter 0.2 --crf 16 --url http://localhost:5191 --out ../out/builders.mp4
```

The full video took about 65 minutes on an Apple Silicon Mac. Stills and contact sheets:
`bun scripts/render.ts stills --t 12,48.8 --url …` and `bun scripts/render.ts sheet --from 0 --to 184 --n 48 --url …`.
See `docs/ENGINE.md` for the rest (`--only`, `--scale 2` for 4K, perf).

## License

The code is released under the [MIT License](LICENSE), like the pdoom-video engine it is built on (whose copyright
notice is kept there). The fonts in `app/public/fonts/` keep their own licenses (SIL Open Font License). The song
(`audio/`) and the lyrics are not covered by the MIT license; the music was generated with Suno and is subject to
Suno's terms.
