// Static content for the `internals` plate: the token sequence of verse 2's first line, attention
// patterns, the river's vocabulary, the ladder's floors and each floor's rendering of the sung line.

/** Tokens of "Made of weights and attention," (BPE-style: leading spaces belong to the token). `w` = lyric word index (-1: none). */
export const TOKENS: { s: string; id: number; w: number }[] = [
  { s: '<s>', id: 1, w: -1 },
  { s: 'Made', id: 40436, w: 0 },
  { s: '·of', id: 315, w: 1 },
  { s: '·weights', id: 14661, w: 2 },
  { s: '·and', id: 323, w: 3 },
  { s: '·attention', id: 6666, w: 4 },
  { s: ',', id: 11, w: 4 }, // the comma is its own token, emitted as "attention," ends
];

/** Head-0 attention of token c over the tokens before it (rows sum to 1). */
export const ATTN: number[][] = [
  [],
  [1.0],
  [0.22, 0.78],
  [0.08, 0.57, 0.35],
  [0.06, 0.18, 0.12, 0.64],
  [0.04, 0.2, 0.05, 0.46, 0.25],
  [0.03, 0.06, 0.04, 0.2, 0.12, 0.55],
];

/** What the river carries (training data, tokenised). */
export const RIVER_VOCAB = [
  '·the', '·of', 'ing', '·model', 'def', '·return', '{', '}', '·night', '·token', '·loss', '·and', '·a', '.', ',', '·is',
  '·build', '·code', '·we', '·to', '·in', '·data', '\\n', 'self', '()', '·=', '·train', '·weights', '·for', '·if', '·print', '·import',
  '·tower', '·app', '·the', '·user', 'ed', '·make', '·it', '·work', '·hello', '·world', '·//', '·<div>', '·SELECT', '·fn', '·let', '·mut',
  '·river', '·light', '·song', '·learn', 'tion', '·every', '·one', '·hands', '·mind', 'er', '·magic', '·trust', '·write', '·words',
];

export interface Floor { name: string; year: string; note: string }
export const FLOORS: Floor[] = [
  { name: 'TRANSISTORS', year: '1947', note: 'on / off' },
  { name: 'MACHINE CODE', year: '1948', note: 'bytes' },
  { name: 'ASSEMBLY', year: '1949', note: 'mnemonics' },
  { name: 'C', year: '1972', note: 'portable' },
  { name: 'PYTHON', year: '1991', note: 'readable' },
  { name: 'ENGLISH', year: '2022', note: 'spoken' },
];

/**
 * A floor's text as lines of pieces; a piece is [text, word index] where the word index refers to the
 * sung line's words (-1 = syntax, typed with the next word; -2 = context already on the floor).
 */
export type Piece = [string, number];
export type Listing = Piece[][];

// "Once we trusted the compiler,"  words: 0 Once, 1 we, 2 trusted, 3 the, 4 compiler,
export const ASM_A: Listing = [
  [['; x86-64 · nasm', -2]],
  [['msg:   db  "', -2], ['Once', 0], [' ', -1], ['we', 1], [' ', -1], ['trusted', 2], [' ', -1], ['the', 3], [' ', -1], ['compiler,', 4], ['", 0', -1]],
  [['       lea  rdi, [rel msg]', -2]],
  [['       call ', -2], ['trust', 2]],
];
export const C_A: Listing = [
  [['#include <trust.h>', -2]],
  [['if (', -2], ['once', 0], [') ', -1], ['we', 1], ['->', -1], ['trusted', 2], [' = ', -1], ['the', 3], ['_', -1], ['compiler', 4], [';', -1]],
];
export const PY_A: Listing = [
  [['>>> ', -2], ['once', 0], [' = ', -1], ['we', 1], ['.', -1], ['trusted', 2], ['(', -1], ['the', 3], ['.', -1], ['compiler', 4], [')', -1]],
  [['True', 4]],
];

// "now we trust the words we write."  words: 0 now, 1 we, 2 trust, 3 the, 4 words, 5 we, 6 write.
export const ASM_B: Listing = [
  [['; x86-64 · nasm', -2]],
  [['msg:   db  "now we trust the words we write.", 0', -2]],
  [['       lea  rdi, [rel msg]', -2]],
  [['       call build', -2]],
];
export const C_B: Listing = [
  [['#include <trust.h>', -2]],
  [['if (now) we->trust(the_words); we->write();', -2]],
];
export const PY_B: Listing = [
  [['>>> now = we.trust(the.words); we.write()', -2]],
  [['<app ready>', -2]],
];

/** The app that assembles from blocks: rows top -> bottom; # frame, = title bar, - list/text, o button. */
export const APP_ART = [
  '############',
  '#==========#',
  '#..........#',
  '#.-------..#',
  '#..........#',
  '#.-----....#',
  '#..........#',
  '#.------...#',
  '#......ooo.#',
  '############',
];
