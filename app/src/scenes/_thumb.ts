// Shared thumbnail typography (see docs/THUMBNAILS.md). Draws into a Canvas2D (e.g. a Layer2D's ctx), in the
// 1920×1080 logical layout; thumbnails are exported at --scale 2 and downscaled to 1280×720.
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';

export interface HeadlineOpts {
  x: number; y: number;               // anchor: left/centre/right edge (by align) of the first line's baseline
  size: number;                       // px (1920 layout). Big: 150–260.
  maxWidth?: number;                  // shrink-to-fit width per line
  width?: number;                     // Archivo width 62–125 (default 75: condensed, punchy)
  weight?: number;                    // 300–900 (default 900)
  lineGap?: number;                   // line advance as a factor of size (default 0.92)
  align?: CanvasTextAlign;            // 'left' | 'center' | 'right'
  tracking?: number;                  // px, negative tightens (default -0.02*size)
  gold?: string[];                    // words drawn in signal gold (case-insensitive match)
  color?: string;                     // palette key for the rest (default 'bone')
  shadow?: number;                    // 0..1 soft ink shadow for legibility over busy art (default 0.6)
}

/** Big stacked headline, 1–3 lines, with some words in gold. Returns the bounding box. */
export function headline(c: CanvasRenderingContext2D, lines: string[], o: HeadlineOpts) {
  const width = o.width ?? 75, weight = o.weight ?? 900, gap = (o.lineGap ?? 0.92) * o.size;
  const gold = new Set((o.gold ?? []).map((w) => w.toLowerCase()));
  const align = o.align ?? 'left';
  let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  lines.forEach((ln, i) => {
    let size = o.size;
    c.save();
    c.font = font(F.archivo(width, weight), size);
    const trk = o.tracking ?? -0.02 * size;
    c.letterSpacing = `${trk}px`;
    let w = c.measureText(ln).width;
    if (o.maxWidth && w > o.maxWidth) { size *= o.maxWidth / w; c.font = font(F.archivo(width, weight), size); c.letterSpacing = `${trk * size / o.size}px`; w = c.measureText(ln).width; }
    const y = o.y + i * gap;
    const x0 = align === 'left' ? o.x : align === 'center' ? o.x - w / 2 : o.x - w;
    // draw word by word so single words can be gold (keeps kerning inside each word)
    let x = x0;
    const words = ln.split(' ');
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    if ((o.shadow ?? 0.6) > 0) { c.shadowColor = rgba('ink', 0.85 * (o.shadow ?? 0.6)); c.shadowBlur = size * 0.18; c.shadowOffsetY = size * 0.03; }
    words.forEach((wd, k) => {
      const key = wd.toLowerCase().replace(/[^a-z0-9’'.,]/g, '').replace(/[.,]$/, '');
      c.fillStyle = gold.has(key) || gold.has(wd.toLowerCase()) ? rgba('signal') : rgba(o.color ?? 'bone');
      c.fillText(wd, x, y);
      x += c.measureText(wd + ' ').width;
    });
    c.restore();
    box = { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y - size * 0.78), x1: Math.max(box.x1, x0 + w), y1: Math.max(box.y1, y + size * 0.1) };
  });
  return box;
}

/** Small mono kicker line with a gold rule, e.g. "A SONG FOR BUILDERS". */
export function kicker(c: CanvasRenderingContext2D, text: string, x: number, y: number, o: { size?: number; align?: CanvasTextAlign; color?: string } = {}) {
  const size = o.size ?? 34;
  c.save();
  c.font = font(F.mono(600), size); c.letterSpacing = `${size * 0.12}px`;
  c.fillStyle = rgba(o.color ?? 'signal'); c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const w = c.measureText(text).width;
  const x0 = (o.align ?? 'left') === 'left' ? x : o.align === 'center' ? x - w / 2 : x - w;
  c.fillText(text, x0, y);
  c.fillRect(x0, y + size * 0.35, Math.min(w, size * 3), Math.max(3, size * 0.1));
  c.restore();
}

/** The small BUILDERS wordmark with a gold caret, for a corner (keep out of the bottom-right timestamp zone). */
export function wordmark(c: CanvasRenderingContext2D, x: number, y: number, size = 54, o: { align?: CanvasTextAlign } = {}) {
  c.save();
  c.font = font(F.archivo(100, 900), size); c.letterSpacing = `${size * 0.04}px`;
  const w = c.measureText('BUILDERS').width;
  const x0 = (o.align ?? 'left') === 'left' ? x : o.align === 'center' ? x - w / 2 : x - w;
  c.fillStyle = rgba('bone'); c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillText('BUILDERS', x0, y);
  c.fillStyle = rgba('signal'); c.fillRect(x0 + w + size * 0.12, y - size * 0.8, size * 0.1, size * 0.95);
  c.restore();
}

/** Debug: draw the safe zones (never in final thumbnails). */
export function safeGuides(c: CanvasRenderingContext2D) {
  c.save(); c.strokeStyle = 'rgba(255,0,0,0.6)'; c.lineWidth = 2;
  c.strokeRect(72, 60, 1920 - 144, 1080 - 120);                 // outer margin
  c.strokeRect(1920 - 330, 1080 - 130, 290, 100);               // YouTube timestamp badge (bottom-right)
  c.restore();
}
