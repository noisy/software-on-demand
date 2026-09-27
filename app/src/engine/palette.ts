import { hexToLinear } from './util';

// BUILDERS palette: ink, bone, one signal colour (molten gold) and cyanotype cobalt paper — see docs/TREATMENT.md.
export const HEX = {
  ink: '#08090B', // background black (neutral, a touch cool)
  ink2: '#141619', // raised black (panels, paper-in-the-dark)
  graphite: '#565B63', // dim lines, secondary text
  ash: '#9AA0A8', // mid grey
  bone: '#ECEAE4', // paper white, primary type, engraving lines
  signal: '#FFB020', // molten gold: the cursor, the sung word, weld sparks, what is being built
  ember: '#FFE3A0', // white-hot gold for cores/highlights
  blood: '#A34E00', // rust: deep shadows of gold
  cobalt: '#0E2A6E', // cyanotype blueprint paper (bone lines on cobalt) - the only other hue
  acid: '#FFB020', // unused (kept so engine GLSL constants compile): same as signal
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
