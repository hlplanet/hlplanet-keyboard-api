import { BEZEL_U, LABELS, LAYOUTS, MODELS, PADS, SITE, SIZE_TOOL_URL, U_MM, type LayoutDef, type Model } from './data.js';

export interface ParsedLayout {
  codes: Set<string>;
  count: number;
  widthU: number;
  depthU: number;
}

/** A keyboard to compare: a standard size, or a real model with its measured case. */
export interface Board {
  kind: 'size' | 'model';
  id: string;
  name: string;
  layout: LayoutDef;
  parsed: ParsedLayout;
  widthMm: number;
  depthMm: number;
  link: string;
  /** Token for the size comparison tool URL (?compare=...) */
  token: string;
  model?: Model;
}

const B_KEY_X = 6.75; // centre of the B key from the left edge of the keys, the usual typing centre

// ISO: tall Enter, the backslash key moves next to it, and left Shift splits to add one more key
function isoTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (t === 'Backslash:1.5') out.push('IsoEnter:1.5');
    else if (t === 'Enter:2.25') out.push('Backslash', '_:1.25');
    else if (t === 'ShiftLeft:2.25') out.push('ShiftLeft:1.25', 'IntlBackslash');
    else out.push(t);
  }
  return out;
}

export function parseLayout(def: LayoutDef, iso = false): ParsedLayout {
  const codes = new Set<string>();
  let count = 0;
  let widthU = 0;
  let depthU = 0;
  for (const [y, spec] of def.rows) {
    let x = 0;
    let tokens = spec.split(' ');
    if (iso) tokens = isoTokens(tokens);
    for (const tok of tokens) {
      const [code, w, h] = tok.split(':');
      const kw = w ? Number(w) : 1;
      const kh = code === 'IsoEnter' ? 2 : h ? Number(h) : 1;
      if (code !== '_') {
        codes.add(code === 'IsoEnter' ? 'Enter' : code);
        count++;
      }
      x += kw;
      widthU = Math.max(widthU, x);
      depthU = Math.max(depthU, y + kh);
    }
  }
  return { codes, count, widthU, depthU };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, '');

export function findLayout(query: string): LayoutDef | undefined {
  const q = query.trim().toLowerCase().replace(/\s*(keyboard|layout|size|percent)\s*/g, ' ').trim();
  const qn = norm(q).replace(/%$/, '');
  return LAYOUTS.find((l) => l.id === q || l.aliases.some((a) => norm(a).replace(/%$/, '') === qn));
}

export function findModels(query: string): Model[] {
  const qn = norm(query);
  if (!qn) return [];
  const exact = MODELS.filter((m) => norm(m.name) === qn || m.id === query.trim().toLowerCase());
  if (exact.length) return exact;
  // Every word of the query has to appear in the name ("air 75 he", "wooting 60")
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return MODELS.filter((m) => {
    const name = norm(m.name);
    return words.every((w) => name.includes(w));
  });
}

export function sizeBoard(def: LayoutDef, iso = false): Board {
  const parsed = parseLayout(def, iso);
  return {
    kind: 'size',
    id: def.id,
    name: def.name + (def.name.includes(def.size) ? '' : ' (' + def.size + ')'),
    layout: def,
    parsed,
    widthMm: (parsed.widthU + 2 * BEZEL_U) * U_MM,
    depthMm: (parsed.depthU + 2 * BEZEL_U) * U_MM,
    link: SIZE_TOOL_URL,
    token: def.id
  };
}

export function modelBoard(m: Model, iso = false): Board {
  const def = LAYOUTS.find((l) => l.id === m.layout)!;
  return {
    kind: 'model',
    id: m.id,
    name: m.name,
    layout: def,
    parsed: parseLayout(def, iso),
    widthMm: m.widthMm,
    depthMm: m.depthMm,
    link: SITE + m.review + '/',
    token: 'm-' + m.id,
    model: m
  };
}

export class LookupError extends Error {}

/** Resolve "75%", "tkl", "Wooting 60HE v2"... to a board, or throw with a helpful message. */
export function resolveBoard(query: string, iso = false): Board {
  const layout = findLayout(query);
  if (layout) return sizeBoard(layout, iso);
  const models = findModels(query);
  if (models.length === 1) return modelBoard(models[0], iso);
  if (models.length > 1) {
    throw new LookupError(`"${query}" matches several keyboards: ${models.map((m) => m.name).join(', ')}. Use the full name.`);
  }
  throw new LookupError(
    `Unknown keyboard or size "${query}". Use a size (100%, 98%, TKL, 75%, 65%, 60%) or one of these keyboards: ` +
      MODELS.map((m) => m.name).join(', ') + '.'
  );
}

export function cm(mm: number): string {
  return (mm / 10).toFixed(1) + ' cm';
}

export function inches(mm: number): string {
  return (mm / 25.4).toFixed(1) + ' in';
}

export function both(mm: number): string {
  return `${cm(mm)} (${inches(mm)})`;
}

export function dims(b: Board): string {
  return `${(b.widthMm / 10).toFixed(1)} x ${(b.depthMm / 10).toFixed(1)} cm (${(b.widthMm / 25.4).toFixed(1)} x ${(b.depthMm / 25.4).toFixed(1)} in)`;
}

export function keyName(code: string): string {
  if (code in LABELS) return LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Numpad ' + code.slice(6);
  return code;
}

const NAV = ['Insert', 'Home', 'PageUp', 'Delete', 'End', 'PageDown'];
const SYS = ['PrintScreen', 'ScrollLock', 'Pause'];
const GROUPS: { name: string; test: (c: string) => boolean; list: boolean }[] = [
  { name: 'Numpad', test: (c) => /^(Numpad|NumLock)/.test(c), list: false },
  { name: 'F1-F12 row', test: (c) => /^F\d+$/.test(c), list: false },
  { name: 'Navigation', test: (c) => NAV.includes(c), list: true },
  { name: 'System', test: (c) => SYS.includes(c), list: true },
  { name: 'Arrow keys', test: (c) => /^Arrow/.test(c), list: false },
  { name: 'Other', test: () => true, list: true }
];

/** "Numpad (17 keys); F1-F12 row (12 keys); Navigation: Insert, Home" */
export function describeKeys(codes: string[]): string {
  const left = codes.slice();
  const parts: string[] = [];
  for (const g of GROUPS) {
    const inGroup = left.filter((c) => g.test(c));
    if (!inGroup.length) continue;
    for (const c of inGroup) left.splice(left.indexOf(c), 1);
    if (!g.list || inGroup.length > 6) parts.push(`${g.name} (${inGroup.length} keys)`);
    else parts.push((g.name === 'Other' ? '' : g.name + ': ') + inGroup.map(keyName).join(', '));
  }
  return parts.join('; ');
}

export function missingKeys(from: Board, to: Board): string[] {
  return [...from.parsed.codes].filter((c) => !to.parsed.codes.has(c));
}

export function toolLink(boards: Board[], extra: string[] = []): string {
  const tokens = [...new Set(boards.map((b) => b.token))].concat(extra);
  return SIZE_TOOL_URL + '?compare=' + tokens.join(',');
}

// ---- Key lookup ----

const KEY_ALIASES: Record<string, string[]> = {
  Delete: ['del', 'delete'],
  Insert: ['ins', 'insert'],
  PageUp: ['pgup', 'pageup', 'page up'],
  PageDown: ['pgdn', 'pagedown', 'page down', 'pgdown'],
  PrintScreen: ['prtsc', 'prtscn', 'printscreen', 'print screen', 'print'],
  ScrollLock: ['scrlk', 'scroll lock', 'scrolllock'],
  Pause: ['pause', 'break', 'pause break'],
  Backquote: ['backtick', 'tilde', 'grave', '`', '~', 'backquote'],
  Escape: ['esc', 'escape'],
  ContextMenu: ['menu', 'menu key', 'context menu', 'application key'],
  MetaRight: ['right win', 'right windows', 'right windows key', 'right super', 'right cmd'],
  MetaLeft: ['win', 'windows', 'windows key', 'super', 'cmd', 'meta'],
  AltRight: ['altgr', 'alt gr', 'right alt'],
  ControlRight: ['right ctrl', 'right control'],
  ShiftRight: ['right shift'],
  NumLock: ['num lock', 'numlock'],
  CapsLock: ['caps', 'caps lock', 'capslock'],
  Fn: ['fn', 'function key']
};

const KEY_GROUPS: Record<string, (c: string) => boolean> = {
  numpad: (c) => /^(Numpad|NumLock)/.test(c),
  'f keys': (c) => /^F\d+$/.test(c),
  'function keys': (c) => /^F\d+$/.test(c),
  'function row': (c) => /^F\d+$/.test(c),
  'f row': (c) => /^F\d+$/.test(c),
  arrows: (c) => /^Arrow/.test(c),
  'arrow keys': (c) => /^Arrow/.test(c),
  'navigation keys': (c) => NAV.includes(c),
  'nav cluster': (c) => NAV.includes(c)
};

/** Turn "del", "F5", "arrow keys", "numpad" into key codes. */
export function resolveKeys(query: string): { label: string; codes: string[] } | undefined {
  const q = query.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').replace(/ key$/, '');
  const group = KEY_GROUPS[q] || KEY_GROUPS[q.replace(/s$/, '')];
  if (group) {
    const all = new Set<string>();
    for (const l of LAYOUTS) for (const c of parseLayout(l).codes) if (group(c)) all.add(c);
    return { label: query.trim(), codes: [...all] };
  }
  for (const [code, aliases] of Object.entries(KEY_ALIASES)) {
    if (aliases.includes(q)) return { label: keyName(code), codes: [code] };
  }
  if (/^f([1-9]|1[0-2])$/.test(q)) return { label: q.toUpperCase(), codes: [q.toUpperCase()] };
  if (/^arrow ?(up|down|left|right)$/.test(q) || /^(up|down|left|right) arrow$/.test(q)) {
    const dir = q.replace(/arrow|\s/g, '');
    return { label: dir + ' arrow', codes: ['Arrow' + dir[0].toUpperCase() + dir.slice(1)] };
  }
  const byLabel = Object.entries(LABELS).find(([, v]) => v.toLowerCase() === q);
  if (byLabel) return { label: byLabel[1], codes: [byLabel[0]] };
  if (/^[a-z]$/.test(q)) return { label: q.toUpperCase(), codes: ['Key' + q.toUpperCase()] };
  if (/^[0-9]$/.test(q)) return { label: q, codes: ['Digit' + q] };
  return undefined;
}

// ---- Desk planner ----

export interface DeskInput {
  deskWidthCm: number;
  deskDepthCm?: number;
  padWidthCm: number;
  isDeskMat: boolean;
  leftHanded: boolean;
  cmPer360?: number;
  /** Move the keyboard from centred (B key in front of the screen); negative = left */
  offsetCm: number;
}

export interface DeskResult {
  board: Board;
  keyboardLeftCm: number;
  keyboardRightCm: number;
  mouseRoomCm: number;
  padSpareCm: number;
  padFits: boolean;
  mouseFromCentreCm: number;
  swipeFits?: boolean;
  swipeShortCm?: number;
  slideToFitCm?: number;
  deskTooNarrowCm?: number;
}

const PAD_GAP_MM = 30; // space between keyboard and mousepad

// The keyboard sits with its B key in front of the screen centre. Real keyboards have the
// standard layout centred in their measured case (scaled down if the case is tighter).
function bKeyFromLeftMm(board: Board): number {
  if (board.kind === 'size') return (BEZEL_U + B_KEY_X) * U_MM;
  const cw = board.widthMm / U_MM;
  const ch = board.depthMm / U_MM;
  const ks = Math.min(1, (cw - 0.2) / board.parsed.widthU, (ch - 0.2) / board.parsed.depthU);
  const kx = (cw - board.parsed.widthU * ks) / 2;
  return (kx + B_KEY_X * ks) * U_MM;
}

export function deskFit(board: Board, d: DeskInput): DeskResult {
  const deskW = d.deskWidthCm * 10;
  const padW = d.padWidthCm * 10;
  const left = deskW / 2 + d.offsetCm * 10 - bKeyFromLeftMm(board);
  const right = left + board.widthMm;
  const mouseSide = d.leftHanded ? left : deskW - right;

  let room: number;
  let padX: number;
  if (d.isDeskMat) {
    padX = (deskW - padW) / 2;
    room = d.leftHanded ? left - padX : padX + padW - right;
  } else {
    room = mouseSide - PAD_GAP_MM;
    padX = d.leftHanded ? left - PAD_GAP_MM - padW : right + PAD_GAP_MM;
  }
  const spare = d.isDeskMat ? room : room - padW;
  const mouseX = d.isDeskMat ? (d.leftHanded ? (padX + left) / 2 : (right + padX + padW) / 2) : padX + padW / 2;

  const result: DeskResult = {
    board,
    keyboardLeftCm: left / 10,
    keyboardRightCm: (deskW - right) / 10,
    mouseRoomCm: Math.max(0, room) / 10,
    padSpareCm: spare / 10,
    padFits: d.isDeskMat ? room >= 200 : spare >= 0,
    mouseFromCentreCm: Math.abs(mouseX - deskW / 2) / 10
  };
  if (d.cmPer360) {
    const space = d.isDeskMat ? room : padW;
    result.swipeFits = space >= d.cmPer360 * 10;
    if (!result.swipeFits) result.swipeShortCm = (d.cmPer360 * 10 - space) / 10;
  }
  if (!d.isDeskMat ? spare < 0 : false) {
    const otherSide = d.leftHanded ? deskW - right : left;
    if (otherSide + spare >= 0) result.slideToFitCm = -spare / 10;
    else result.deskTooNarrowCm = -(otherSide + spare) / 10;
  }
  return result;
}

export { LAYOUTS, MODELS, PADS };
