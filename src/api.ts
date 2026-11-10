// JSON endpoints of the HLPlanet Keyboard API. All lengths are millimetres unless the field name says _cm.
import { LAYOUTS, MODELS, PADS, SITE, SIZE_TOOL_URL, TESTING_TOOLS, type LayoutDef } from './data.js';
import {
  LookupError,
  deskFit,
  describeKeys,
  findLayout,
  findModels,
  missingKeys,
  modelBoard,
  resolveBoard,
  resolveKeys,
  sizeBoard,
  toolLink,
  type Board
} from './keyboards.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const mm = (v: number) => Math.round(v * 10) / 10;
const cm = (v: number) => Math.round(v * 10) / 10;

function keySet(codes: string[]) {
  return { summary: codes.length ? describeKeys(codes) : 'none', count: codes.length, codes };
}

export function sizeJson(def: LayoutDef) {
  const b = sizeBoard(def);
  const full = sizeBoard(LAYOUTS[0]);
  return {
    id: def.id,
    name: b.name,
    size: def.size,
    keys: b.parsed.count,
    typical_width_mm: mm(b.widthMm),
    typical_depth_mm: mm(b.depthMm),
    narrower_than_full_size_mm: mm(full.widthMm - b.widthMm),
    missing_vs_full_size: keySet(missingKeys(full, b)),
    best_for: def.bestFor,
    reviews: def.reviews.map(([name, slug]) => ({ name, url: `${SITE}${slug}/` })),
    compare_url: toolLink([b])
  };
}

export function keyboardJson(b: Board) {
  return {
    id: b.model!.id,
    name: b.name,
    size: b.layout.size,
    layout_id: b.layout.id,
    keys: b.parsed.count,
    width_mm: b.widthMm,
    depth_mm: b.depthMm,
    review_url: b.link,
    compare_url: toolLink([b])
  };
}

function boardJson(b: Board) {
  return {
    kind: b.kind,
    id: b.kind === 'model' ? b.model!.id : b.layout.id,
    name: b.name,
    size: b.layout.size,
    keys: b.parsed.count,
    width_mm: mm(b.widthMm),
    depth_mm: mm(b.depthMm),
    measured: b.kind === 'model',
    ...(b.kind === 'model' ? { review_url: b.link } : {})
  };
}

function resolve(query: string, iso: boolean): Board {
  try {
    return resolveBoard(query, iso);
  } catch (err) {
    if (err instanceof LookupError) throw new ApiError(400, 'unknown_keyboard', err.message);
    throw err;
  }
}

function bool(v: string | null): boolean {
  return v === 'true' || v === '1' || v === 'yes';
}

function number(params: URLSearchParams, name: string, min: number, max: number, required = false): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw === '') {
    if (required) throw new ApiError(400, 'missing_parameter', `Query parameter "${name}" is required.`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(400, 'invalid_parameter', `"${name}" must be a number from ${min} to ${max}.`);
  return n;
}

export function listSizes() {
  return { sizes: LAYOUTS.map(sizeJson), compare_url: toolLink(LAYOUTS.map((l) => sizeBoard(l))), source: SIZE_TOOL_URL };
}

export function getSize(id: string) {
  const def = LAYOUTS.find((l) => l.id === id) ?? findLayout(id);
  if (!def) throw new ApiError(404, 'unknown_size', `Unknown size "${id}". Use one of: ${LAYOUTS.map((l) => l.id).join(', ')}.`);
  return sizeJson(def);
}

export function listKeyboards(params: URLSearchParams) {
  let models = MODELS;
  const size = params.get('size');
  if (size) {
    const def = LAYOUTS.find((l) => l.id === size) ?? findLayout(size);
    if (!def) throw new ApiError(400, 'unknown_size', `Unknown size "${size}". Use one of: ${LAYOUTS.map((l) => l.id).join(', ')}.`);
    models = models.filter((m) => m.layout === def.id);
  }
  const q = params.get('q');
  if (q) {
    const found = new Set(findModels(q).map((m) => m.id));
    models = models.filter((m) => found.has(m.id));
  }
  return { keyboards: models.map((m) => keyboardJson(modelBoard(m))), count: models.length, source: SIZE_TOOL_URL };
}

export function getKeyboard(id: string) {
  const m = MODELS.find((x) => x.id === id) ?? (findModels(id).length === 1 ? findModels(id)[0] : undefined);
  if (!m) throw new ApiError(404, 'unknown_keyboard', `Unknown keyboard "${id}". GET /v1/keyboards lists the ids.`);
  return keyboardJson(modelBoard(m));
}

export function compare(params: URLSearchParams) {
  const items = (params.get('items') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (items.length < 2 || items.length > 6) throw new ApiError(400, 'invalid_parameter', '"items" needs 2 to 6 comma-separated sizes or keyboard ids, e.g. items=tkl,75,wooting-80he.');
  const iso = bool(params.get('iso'));
  const boards = items.map((i) => resolve(i, iso));
  const ref = boards[0];
  return {
    layout: iso ? 'ISO' : 'ANSI',
    reference: boardJson(ref),
    items: boards.slice(1).map((b) => ({
      ...boardJson(b),
      width_diff_mm: mm(b.widthMm - ref.widthMm),
      depth_diff_mm: mm(b.depthMm - ref.depthMm),
      missing_keys: keySet(missingKeys(ref, b)),
      extra_keys: keySet(missingKeys(b, ref))
    })),
    compare_url: toolLink(boards, ['ref-' + ref.token]),
    notes: 'Negative width_diff_mm means narrower than the reference. Missing keys are usually reached through an Fn layer.'
  };
}

export function deskFitJson(params: URLSearchParams) {
  const keyboard = params.get('keyboard');
  if (!keyboard) throw new ApiError(400, 'missing_parameter', 'Query parameter "keyboard" is required, e.g. keyboard=tkl.');
  const b = resolve(keyboard, false);
  const deskWidthCm = number(params, 'desk_width_cm', 30, 400, true)!;
  const padType = params.get('mousepad') ?? 'large';
  let padWidthCm: number;
  let padName: string;
  if (padType === 'custom') {
    padWidthCm = number(params, 'mousepad_width_cm', 5, 200, true)!;
    padName = `Custom mousepad (${padWidthCm} cm wide)`;
  } else if (padType in PADS) {
    padWidthCm = PADS[padType].widthMm / 10;
    padName = PADS[padType].name;
  } else {
    throw new ApiError(400, 'invalid_parameter', '"mousepad" must be small, medium, large, xl, deskmat or custom.');
  }
  const cmPer360 = number(params, 'cm_per_360', 1, 200);
  const leftHanded = bool(params.get('left_handed'));
  const offsetCm = number(params, 'keyboard_offset_cm', -100, 100) ?? 0;
  const r = deskFit(b, { deskWidthCm, padWidthCm, isDeskMat: padType === 'deskmat', leftHanded, cmPer360, offsetCm });
  return {
    keyboard: boardJson(b),
    desk_width_cm: deskWidthCm,
    mousepad: { type: padType, name: padName, width_cm: padWidthCm },
    left_handed: leftHanded,
    mouse_room_cm: cm(r.mouseRoomCm),
    pad_fits: r.padFits,
    pad_spare_cm: cm(r.padSpareCm),
    mouse_from_screen_centre_cm: cm(r.mouseFromCentreCm),
    turn_360: cmPer360 === undefined ? null : { cm_per_360: cmPer360, fits: !!r.swipeFits, short_by_cm: r.swipeShortCm === undefined ? 0 : cm(r.swipeShortCm) },
    tip: r.slideToFitCm ? { slide_keyboard_cm: cm(r.slideToFitCm), direction: leftHanded ? 'right' : 'left' } : null,
    desk_too_narrow_by_cm: r.deskTooNarrowCm ? cm(r.deskTooNarrowCm) : null,
    planner_url: toolLink([b], ['desk']),
    notes: 'The keyboard is placed with its B key in front of the screen centre, with 3 cm between keyboard and mousepad.'
  };
}

export function keyAvailability(key: string, params: URLSearchParams) {
  const found = resolveKeys(key);
  if (!found) throw new ApiError(404, 'unknown_key', `Unknown key "${key}". Try delete, f5, page-up, print-screen, arrow-keys or numpad.`);
  const iso = bool(params.get('iso'));
  return {
    key: found.label,
    codes: found.codes,
    layout: iso ? 'ISO' : 'ANSI',
    sizes: LAYOUTS.map((l) => {
      const b = sizeBoard(l, iso);
      const present = found.codes.filter((c) => b.parsed.codes.has(c)).length;
      return { id: l.id, name: b.name, has: present === found.codes.length ? 'yes' : present ? 'partly' : 'no', present, total: found.codes.length };
    }),
    notes: 'Sizes without the key usually reach it through an Fn layer. Layouts vary slightly by brand.',
    source: SIZE_TOOL_URL
  };
}

export function tools() {
  return { tools: TESTING_TOOLS.map(([name, url, description]) => ({ name, url, description })) };
}
