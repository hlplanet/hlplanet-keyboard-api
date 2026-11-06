// Markdown answers for the MCP tools. Same wording as the hlplanet-mcp server
// (https://github.com/hlplanet/hlplanet-mcp), so both give the same answers.
import { LAYOUTS, MODELS, PADS, SITE, SIZE_TOOL_URL } from './data.js';
import {
  LookupError,
  both,
  deskFit,
  describeKeys,
  dims,
  missingKeys,
  modelBoard,
  resolveBoard,
  resolveKeys,
  sizeBoard,
  toolLink,
  type Board
} from './keyboards.js';

export function listSizesText(): string {
  const full = sizeBoard(LAYOUTS[0]);
  const lines = ['# Keyboard sizes (ANSI)', ''];
  for (const def of LAYOUTS) {
    const b = sizeBoard(def);
    const lost = missingKeys(full, b);
    lines.push(`## ${b.name}`);
    lines.push(`- Keys: ${b.parsed.count}`);
    lines.push(`- Typical size: ${dims(b)}`);
    lines.push(`- Narrower than full-size by: ${both(full.widthMm - b.widthMm)}`);
    lines.push(`- Missing vs full-size: ${lost.length ? describeKeys(lost) : 'nothing'}`);
    lines.push(`- Best for: ${def.bestFor}`);
    lines.push(`- Reviews: ${def.reviews.map(([n, slug]) => `${n} (${SITE}${slug}/)`).join(', ')}`);
    lines.push('');
  }
  lines.push('Typical sizes use the standard 19.05 mm key spacing plus an estimated 10 mm case border.');
  lines.push(`Compare them visually, to scale: ${toolLink(LAYOUTS.map((l) => sizeBoard(l)))}`);
  return lines.join('\n');
}

export function compareText(keyboards: string[], iso?: boolean): string {
  const boards = keyboards.map((k) => resolveBoard(k, iso));
  const ref = boards[0];
  const lines = [`# ${boards.map((b) => b.name).join(' vs ')}`, ''];
  lines.push('| Keyboard | Layout | Keys | Size (W x D) | Width vs ' + ref.name + ' |');
  lines.push('|---|---|---|---|---|');
  for (const b of boards) {
    const dw = b.widthMm - ref.widthMm;
    const delta = b === ref ? 'reference' : `${dw > 0 ? '+' : '-'}${both(Math.abs(dw))}`;
    lines.push(`| ${b.name} | ${b.layout.size} | ${b.parsed.count} | ${dims(b)} | ${delta} |`);
  }
  lines.push('');
  for (const b of boards.slice(1)) {
    const lost = missingKeys(ref, b);
    const added = missingKeys(b, ref);
    const dw = ref.widthMm - b.widthMm;
    lines.push(`## ${b.name} compared to ${ref.name}`);
    if (Math.abs(dw) >= 1) lines.push(`- ${dw > 0 ? 'Narrower' : 'Wider'} by ${both(Math.abs(dw))}${dw > 0 ? ': that much more room for the mouse' : ''}`);
    lines.push(`- Depth difference: ${both(Math.abs(ref.depthMm - b.depthMm))}`);
    lines.push(`- Missing keys: ${lost.length ? describeKeys(lost) + '. These are usually reached through an Fn layer.' : 'none'}`);
    if (added.length) lines.push(`- Extra keys: ${describeKeys(added)}`);
    lines.push('');
  }
  const reviews = boards.filter((b) => b.kind === 'model').map((b) => `${b.name}: ${b.link}`);
  if (reviews.length) lines.push('Reviews: ' + reviews.join(' | '));
  if (boards.some((b) => b.kind === 'model')) lines.push('Real keyboards use the case size measured in the HLPlanet review; key lists follow the standard layout of that size.');
  lines.push(`See them to scale, one under another: ${toolLink(boards, ['ref-' + ref.token])}`);
  return lines.join('\n');
}

export function dimensionsText(query?: string, size?: string): string {
  let models = MODELS;
  if (size) {
    const def = resolveBoard(size).layout;
    models = models.filter((m) => m.layout === def.id);
  }
  if (query) {
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    models = models.filter((m) => words.every((w) => m.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(w)));
  }
  if (!models.length) {
    // Maybe they asked for a size, not a model
    if (query) {
      try {
        const b = resolveBoard(query);
        if (b.kind === 'size') return `${b.name}: typical size ${dims(b)}, ${b.parsed.count} keys (estimated from the standard layout).\nCompare to scale: ${toolLink([b])}`;
      } catch {
        // fall through
      }
    }
    throw new LookupError(`No reviewed keyboard matches${query ? ` "${query}"` : ''}${size ? ` in ${size}` : ''}. Known keyboards: ${MODELS.map((m) => m.name).join(', ')}.`);
  }
  const boards = models.map((m) => modelBoard(m)).sort((a, b) => b.widthMm - a.widthMm);
  const lines = ['| Keyboard | Size | Dimensions (W x D) | Review |', '|---|---|---|---|'];
  for (const b of boards) lines.push(`| ${b.name} | ${b.layout.size} | ${dims(b)} | ${b.link} |`);
  lines.push('');
  lines.push('Dimensions are the case size measured in the HLPlanet review.');
  lines.push(`Compare these to scale: ${toolLink(boards.slice(0, 6))}`);
  return lines.join('\n');
}

export interface DeskFitArgs {
  keyboards: string[];
  desk_width_cm: number;
  mousepad?: string;
  mousepad_width_cm?: number;
  cm_per_360?: number;
  left_handed?: boolean;
  keyboard_offset_cm?: number;
}

export function deskFitText(a: DeskFitArgs): string {
  const padKey = a.mousepad || 'large';
  let padWidthCm: number;
  let padName: string;
  if (padKey === 'custom') {
    if (!a.mousepad_width_cm) throw new LookupError('Set mousepad_width_cm when mousepad is "custom".');
    padWidthCm = a.mousepad_width_cm;
    padName = `custom mousepad (${padWidthCm} cm wide)`;
  } else {
    padWidthCm = PADS[padKey].widthMm / 10;
    padName = PADS[padKey].name;
  }
  const boards: Board[] = a.keyboards.map((k) => resolveBoard(k));
  const input = {
    deskWidthCm: a.desk_width_cm,
    padWidthCm,
    isDeskMat: padKey === 'deskmat',
    leftHanded: !!a.left_handed,
    cmPer360: a.cm_per_360,
    offsetCm: a.keyboard_offset_cm || 0
  };
  const lines = [`# Desk fit: ${a.desk_width_cm} cm desk, ${padName}${a.cm_per_360 ? `, ${a.cm_per_360} cm/360` : ''}`, ''];
  for (const b of boards) {
    const r = deskFit(b, input);
    lines.push(`## ${b.name} (${dims(b)})`);
    lines.push(`- Mouse room next to the keyboard: ${r.mouseRoomCm.toFixed(1)} cm`);
    if (input.isDeskMat) lines.push(`- ${r.padFits ? 'Plenty of mat left for the mouse' : 'The mat leaves little room for the mouse'}`);
    else lines.push(`- ${r.padFits ? `Mousepad fits, ${r.padSpareCm.toFixed(1)} cm to spare` : `Mousepad hangs ${(-r.padSpareCm).toFixed(1)} cm off the desk`}`);
    lines.push(`- Mouse sits ${r.mouseFromCentreCm.toFixed(1)} cm from the screen centre`);
    if (r.swipeFits !== undefined) lines.push(`- 360 turn: ${r.swipeFits ? 'fits' : `needs ${r.swipeShortCm!.toFixed(1)} cm more`}`);
    if (r.slideToFitCm) lines.push(`- Tip: slide the keyboard ${r.slideToFitCm.toFixed(1)} cm to the ${input.leftHanded ? 'right' : 'left'} and the pad fits`);
    if (r.deskTooNarrowCm) lines.push(`- This desk is ${r.deskTooNarrowCm.toFixed(1)} cm too narrow for this keyboard and pad side by side`);
    if (b.kind === 'model') lines.push(`- Review: ${b.link}`);
    lines.push('');
  }
  lines.push('Assumes 3 cm between keyboard and mousepad, with the keyboard centred on the screen.');
  lines.push(`Try it on a drawing of your desk: ${toolLink(boards, ['desk'])}`);
  return lines.join('\n');
}

/** One row per size: [size name, "yes" | "partly (...)" | "no, usually on an Fn layer"] */
export function keyAvailability(key: string, iso?: boolean): { label: string; rows: [string, string][] } {
  const found = resolveKeys(key);
  if (!found) throw new LookupError(`Unknown key "${key}". Try a name like "Delete", "F5", "Page Up", "Print Screen", "arrow keys" or "numpad".`);
  const rows: [string, string][] = LAYOUTS.map((l) => {
    const b = sizeBoard(l, iso);
    const have = found.codes.filter((c) => b.parsed.codes.has(c));
    let state: string;
    if (have.length === found.codes.length) state = 'yes';
    else if (have.length) state = `partly (${have.length} of ${found.codes.length} keys)`;
    else state = 'no, usually on an Fn layer';
    return [b.name, state];
  });
  return { label: found.label, rows };
}

export function whichSizesHaveKeyText(key: string, iso?: boolean): string {
  const { label, rows } = keyAvailability(key, iso);
  const lines = [`# ${label}`, ''];
  for (const [name, state] of rows) lines.push(`- ${name}: ${state}`);
  lines.push('');
  lines.push('Layouts vary slightly by brand; this follows the most common arrangement of each size.');
  lines.push(`Press the key on the interactive comparison to see where it sits: ${SIZE_TOOL_URL}`);
  return lines.join('\n');
}
