// The edit: which plate plays when. Boundaries come from the song's sections (data/audio.json), which are
// snapped to downbeats and anchored to the aligned lyrics, so they follow the data instead of hard-coded times.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

/** Start time of thumbnail slot k (1..5) of author n (1..6). */
export const THUMB_T = (n: number, k: number) => 400 + (n - 1) * 20 + (k - 1) * 2;

export function makeTimeline(_ly: Lyrics, au: AudioData): TimelineEntry[] {
  const sec = (name: string) => {
    const s = au.sections.find((x) => x.name === name);
    if (!s) throw new Error(`section not found: ${name}`);
    return s;
  };
  const S = (name: string) => sec(name).start;
  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });

  return [
    E('open', 'open', 0, S('build')),                                   // the Clarke quote, spoken
    E('boot', 'boot', S('build'), S('verse1')),                         // the cursor types; BUILDERS assembles from blocks
    E('oldworld', 'oldworld', S('verse1'), S('pre1')),                  // cyanotype: a hundred hands, the tower, the long tail in the rain
    E('jevons', 'jevons', S('pre1'), S('chorus1')),                     // the cost falls, Jevons rings the bell
    E('hook1', 'hook', S('chorus1'), S('inst1'), { params: { n: 1 } }),   // the workbench: one builder
    E('longtail', 'longtail', S('inst1'), S('verse2')),                 // the long tail lights up
    E('internals', 'internals', S('verse2'), S('pre2')),                // weights, attention, tokens, the ladder of abstraction
    E('niche', 'niche', S('pre2'), S('chorus2')),                       // every niche, worth the machine
    E('hook2', 'hook', S('chorus2'), S('inst2'), { params: { n: 2 } }),   // a planet of builders
    E('machine', 'machine', S('inst2'), S('bridge')),                   // matmul, gradient descent, softmax
    E('glass', 'glass', S('bridge'), S('chorus3')),                     // the tower returns; the glass breaks
    E('hook3', 'hook', S('chorus3'), S('outro'), { params: { n: 3 } }),   // the magician
    E('outro', 'outro', S('outro'), au.duration),                       // callbacks, the last hook, the title block
    // Thumbnails (docs/THUMBNAILS.md): stills only, parked after the song. Author n owns scenes/thumb-a<n>.ts;
    // slot k of author n lives at THUMB_T(n, k) .. +2 s (render the still at THUMB_T(n, k) + 1).
    ...[1, 2, 3, 4, 5, 6].flatMap((n) => [1, 2, 3, 4, 5].map((k) =>
      E(`th${n}-${k}`, `thumb-a${n}`, THUMB_T(n, k), THUMB_T(n, k) + 2, { params: { k } }))),
  ];
}
