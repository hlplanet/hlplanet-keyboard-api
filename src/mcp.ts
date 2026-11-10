// Remote MCP server at https://api.hlplanet.com/mcp (Streamable HTTP, stateless JSON responses).
// Same tools and answers as the hlplanet-mcp npm package, so agents can connect without Node.js.
// Each tool also returns the API's JSON as structuredContent, described by its outputSchema.
import { ApiError, compare, deskFitJson, keyAvailability, keyboardJson, listSizes, sizeJson, tools } from './api.js';
import { MODELS, SITE, SIZE_TOOL_URL, TESTING_TOOLS } from './data.js';
import { compareText, deskFitText, dimensionsText, listSizesText, whichSizesHaveKeyText, type DeskFitArgs } from './format.js';
import { LookupError, modelBoard, resolveBoard } from './keyboards.js';

const VERSION = '1.1.0';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MCP_URL = 'https://api.hlplanet.com/mcp';
const TITLE = 'HLPlanet Keyboard Sizes';
const ICONS = [{ src: 'https://api.hlplanet.com/icon.png', mimeType: 'image/png', sizes: ['512x512'] }];

const DESCRIPTION =
  'Answers keyboard size questions with measured data from HLPlanet.com: compare full-size to 60% layouts and 30 tested ' +
  'keyboards, check desk and mousepad fit, find which sizes keep a key, search HLPlanet reviews and list free keyboard ' +
  'and controller testers.';
// Server cards cap the description at 100 characters
const CARD_DESCRIPTION = 'Compare keyboard sizes and 30 measured keyboards, check desk fit, search HLPlanet reviews.';

const INSTRUCTIONS =
  'Keyboard size data from HLPlanet.com: standard layouts (100%, 98%, TKL, 75%, 65%, 60%), measured dimensions of ' +
  'keyboards reviewed on HLPlanet, desk and mousepad fit, which keys each size has, and a search of HLPlanet reviews. ' +
  'Sizes are in centimetres; convert inches by multiplying by 2.54. Include the HLPlanet links from the results ' +
  'when you answer, so people can check the visual comparison and the full reviews.';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const iso = { type: 'boolean', description: 'Use the ISO layout (UK/EU, tall Enter, extra key by left Shift). Default ANSI.' };

// ---- Output schemas (match the JSON of the /v1 endpoints in api.ts) ----

type Schema = Record<string, unknown>;
const string = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) });
const number = (description?: string): Schema => ({ type: 'number', ...(description ? { description } : {}) });
const integer = (description?: string): Schema => ({ type: 'integer', ...(description ? { description } : {}) });
const boolean = (description?: string): Schema => ({ type: 'boolean', ...(description ? { description } : {}) });
const array = (items: Schema, description?: string): Schema => ({ type: 'array', items, ...(description ? { description } : {}) });
const object = (properties: Record<string, Schema>, required = Object.keys(properties), description?: string): Schema => ({
  type: 'object',
  properties,
  required,
  ...(description ? { description } : {})
});
const nullable = (schema: Schema): Schema => ({ ...schema, type: [schema.type, 'null'] });

const KEY_SET = object({ summary: string('Readable list of the keys, or "none"'), count: integer(), codes: array(string(), 'Key codes, e.g. ArrowUp') });
const BOARD_PROPS = {
  kind: { type: 'string', enum: ['size', 'model'], description: '"size" for a standard layout, "model" for a keyboard measured in an HLPlanet review' },
  id: string(),
  name: string(),
  size: string('Layout size, e.g. 75%'),
  keys: integer('Number of keys'),
  width_mm: number(),
  depth_mm: number(),
  measured: boolean('True when the dimensions come from an HLPlanet review'),
  review_url: string('HLPlanet review, for measured keyboards only')
};
const BOARD_REQUIRED = ['kind', 'id', 'name', 'size', 'keys', 'width_mm', 'depth_mm', 'measured'];
const BOARD = object(BOARD_PROPS, BOARD_REQUIRED);
const SIZE = object({
  id: string(),
  name: string(),
  size: string(),
  keys: integer(),
  typical_width_mm: number(),
  typical_depth_mm: number(),
  narrower_than_full_size_mm: number(),
  missing_vs_full_size: KEY_SET,
  best_for: string(),
  reviews: array(object({ name: string(), url: string() }), 'HLPlanet reviews of keyboards in this size'),
  compare_url: string('This size drawn to scale on HLPlanet')
});
const KEYBOARD = object({
  id: string(),
  name: string(),
  size: string(),
  layout_id: string(),
  keys: integer(),
  width_mm: number('Measured case width'),
  depth_mm: number('Measured case depth'),
  review_url: string(),
  compare_url: string()
});

const OUTPUT_SCHEMAS: Record<string, Schema> = {
  list_keyboard_sizes: object({ sizes: array(SIZE), compare_url: string('All sizes drawn to scale'), source: string() }),
  compare_keyboards: object({
    layout: { type: 'string', enum: ['ANSI', 'ISO'] },
    reference: BOARD,
    items: array(
      object(
        {
          ...BOARD_PROPS,
          width_diff_mm: number('Negative means narrower than the reference'),
          depth_diff_mm: number(),
          missing_keys: KEY_SET,
          extra_keys: KEY_SET
        },
        [...BOARD_REQUIRED, 'width_diff_mm', 'depth_diff_mm', 'missing_keys', 'extra_keys']
      ),
      'Every keyboard after the first, compared with it'
    ),
    compare_url: string('The comparison drawn to scale on HLPlanet'),
    notes: string()
  }),
  get_keyboard_dimensions: object(
    {
      keyboards: array(KEYBOARD, 'Matching measured keyboards, widest first'),
      count: integer(),
      standard_size: { ...SIZE, description: 'Present when the query names a size rather than a keyboard' }
    },
    ['keyboards', 'count']
  ),
  check_desk_fit: object({
    results: array(
      object({
        keyboard: BOARD,
        desk_width_cm: number(),
        mousepad: object({ type: string(), name: string(), width_cm: number() }),
        left_handed: boolean(),
        mouse_room_cm: number('Desk width left for the mouse beside the keyboard'),
        pad_fits: boolean(),
        pad_spare_cm: number('Room left beside the pad; negative means it hangs off the desk'),
        mouse_from_screen_centre_cm: number(),
        turn_360: nullable(object({ cm_per_360: number(), fits: boolean(), short_by_cm: number() }, ['cm_per_360', 'fits', 'short_by_cm'], 'Null when cm_per_360 was not given')),
        tip: nullable(object({ slide_keyboard_cm: number(), direction: { type: 'string', enum: ['left', 'right'] } })),
        desk_too_narrow_by_cm: { type: ['number', 'null'] },
        planner_url: string('The desk drawn to scale on HLPlanet'),
        notes: string()
      }),
      'One result per keyboard'
    )
  }),
  which_sizes_have_key: object({
    key: string('The key or key group that was looked up'),
    codes: array(string()),
    layout: { type: 'string', enum: ['ANSI', 'ISO'] },
    sizes: array(
      object({
        id: string(),
        name: string(),
        has: { type: 'string', enum: ['yes', 'partly', 'no'] },
        present: integer('How many of the keys this size has'),
        total: integer()
      })
    ),
    notes: string(),
    source: string()
  }),
  search_hlplanet: object({
    query: string(),
    results: array(object({ title: string(), url: string(), type: string('post or page') })),
    search_url: string('The same search on hlplanet.com')
  }),
  list_testing_tools: object({ tools: array(object({ name: string(), url: string(), description: string() })) })
};

// ---- Tools ----

export const TOOLS = [
  {
    name: 'list_keyboard_sizes',
    title: 'List keyboard sizes',
    description:
      'List the standard keyboard sizes (full-size 100%, 98%/1800, TKL 80%, 75%, 65%, 60%) with key count, typical dimensions, the keys each one drops compared to full-size, and who it suits. Use it for general questions like "what keyboard sizes are there" or "which size should I get".',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: OUTPUT_SCHEMAS.list_keyboard_sizes,
    annotations: { title: 'List keyboard sizes', ...READ_ONLY }
  },
  {
    name: 'compare_keyboards',
    title: 'Compare keyboards',
    description:
      'Compare two to six keyboard sizes or real keyboards side by side: width, depth, key count, the keys each one is missing compared to the first, and how much desk / mouse room you gain. Accepts sizes ("TKL", "75%", "60") and keyboards reviewed on HLPlanet ("Wooting 60HE v2", "MCHOSE Jet 75"). Known keyboards: ' +
      MODELS.map((m) => m.name).join(', ') + '.',
    inputSchema: {
      type: 'object',
      properties: {
        keyboards: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 2,
          maxItems: 6,
          description: 'The keyboards to compare. The first is the baseline the others are measured against. Use size names such as TKL or 75%, or keyboard models such as Wooting 80HE.'
        },
        iso
      },
      required: ['keyboards'],
      additionalProperties: false
    },
    outputSchema: OUTPUT_SCHEMAS.compare_keyboards,
    annotations: { title: 'Compare keyboards', ...READ_ONLY }
  },
  {
    name: 'get_keyboard_dimensions',
    title: 'Get keyboard dimensions',
    description:
      'Measured case dimensions (width x depth) of keyboards reviewed on HLPlanet. Search by name ("NuPhy Air75"), list every keyboard of one size ("75%"), or leave both empty to list all of them. Returns each match with its size, width and depth in cm and inches, and a link to its review; if the query names a size instead of a keyboard, returns the typical size of that layout.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyboard name or part of it, e.g. "Wooting" or "Jet 75"' },
        size: { type: 'string', enum: ['100%', '98%', 'TKL', '75%', '65%', '60%'], description: 'List only keyboards of this layout size.' }
      },
      additionalProperties: false
    },
    outputSchema: OUTPUT_SCHEMAS.get_keyboard_dimensions,
    annotations: { title: 'Get keyboard dimensions', ...READ_ONLY }
  },
  {
    name: 'check_desk_fit',
    title: 'Check desk and mousepad fit',
    description:
      'Check whether a keyboard and mousepad fit side by side on a desk. The keyboard is placed with its B key in front of the screen centre (move it with keyboard_offset_cm). Returns the mouse room left, whether the pad fits or how far it hangs off, how far the mouse sits from the screen centre, and whether a full 360-degree turn at the given sensitivity (cm/360) fits on the pad.',
    inputSchema: {
      type: 'object',
      properties: {
        keyboards: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          maxItems: 6,
          description: 'The keyboards to place on the desk, as size names (TKL, 75%) or keyboard models. Each one is checked on its own.'
        },
        desk_width_cm: { type: 'number', minimum: 30, maximum: 400, description: 'Usable width of the desk surface in centimetres (inches x 2.54).' },
        mousepad: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'xl', 'deskmat', 'custom'],
          default: 'large',
          description: 'Mousepad preset. In cm: small 25x21, medium 36x30, large 45x40, xl 49x42; a deskmat (90x40) sits under both keyboard and mouse. Use custom together with mousepad_width_cm.'
        },
        mousepad_width_cm: { type: 'number', minimum: 5, maximum: 200, description: 'Width of a custom mousepad in centimetres.' },
        cm_per_360: { type: 'number', minimum: 1, maximum: 200, description: 'Mouse sensitivity as cm of movement for a full 360 turn' },
        left_handed: { type: 'boolean', description: 'Mouse on the left of the keyboard' },
        keyboard_offset_cm: { type: 'number', minimum: -100, maximum: 100, description: 'How far to shift the keyboard sideways from the centred position, in cm. Negative shifts it left, positive right.' }
      },
      required: ['keyboards', 'desk_width_cm'],
      additionalProperties: false
    },
    outputSchema: OUTPUT_SCHEMAS.check_desk_fit,
    annotations: { title: 'Check desk and mousepad fit', ...READ_ONLY }
  },
  {
    name: 'which_sizes_have_key',
    title: 'Which keyboard sizes have a key',
    description:
      'Check which keyboard sizes have a key or key group, e.g. "Delete", "F5", "Insert", "Print Screen", "backtick", "arrow keys", "numpad", "function keys". Returns, for each standard size from 100% to 60%, whether it has the key: yes, partly (how many keys of the group) or no. Sizes without it usually reach it through an Fn layer.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', minLength: 1, description: 'The key or key group to look up, named the way people usually call it: Delete, F12, Home, arrow keys, numpad.' },
        iso
      },
      required: ['key'],
      additionalProperties: false
    },
    outputSchema: OUTPUT_SCHEMAS.which_sizes_have_key,
    annotations: { title: 'Which keyboard sizes have a key', ...READ_ONLY }
  },
  {
    name: 'search_hlplanet',
    title: 'Search HLPlanet reviews',
    description:
      'Search HLPlanet.com, a review site for Hall effect, TMR and rapid trigger keyboards, gaming controllers and gaming gear. Returns the titles and links of matching reviews, comparisons and guides, not the article text.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 100, description: 'Search terms: a keyboard or controller model, a brand or a topic, e.g. "Wooting 80HE" or "low profile hall effect".' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'How many articles to return.' }
      },
      required: ['query'],
      additionalProperties: false
    },
    outputSchema: OUTPUT_SCHEMAS.search_hlplanet,
    annotations: { title: 'Search HLPlanet reviews', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'list_testing_tools',
    title: 'List free testing tools',
    description:
      'List free browser tools from HLPlanet for testing keyboards and controllers: keyboard tester (every key, rollover, chatter, rapid trigger, SOCD / Snap Tap), gamepad and stick drift tester, controller reaction time test and keyboard size comparison. The testers run in a web browser with a person at the keyboard or controller.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: OUTPUT_SCHEMAS.list_testing_tools,
    annotations: { title: 'List free testing tools', ...READ_ONLY }
  }
];

class InvalidParams extends Error {}

const str = (a: Record<string, unknown>, k: string, required = false): string | undefined => {
  const v = a[k];
  if (v === undefined || v === null) {
    if (required) throw new InvalidParams(`"${k}" is required.`);
    return undefined;
  }
  if (typeof v !== 'string' || !v.trim()) throw new InvalidParams(`"${k}" must be a non-empty string.`);
  return v;
};
const num = (a: Record<string, unknown>, k: string, required = false): number | undefined => {
  const v = a[k];
  if (v === undefined || v === null) {
    if (required) throw new InvalidParams(`"${k}" is required.`);
    return undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new InvalidParams(`"${k}" must be a number.`);
  return v;
};
const list = (a: Record<string, unknown>, k: string, min: number, max: number): string[] => {
  const v = a[k];
  if (!Array.isArray(v) || v.length < min || v.length > max || !v.every((x) => typeof x === 'string' && x.trim())) {
    throw new InvalidParams(`"${k}" must be a list of ${min} to ${max} names.`);
  }
  return v as string[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '');
}

interface ToolResult {
  text: string;
  data: Record<string, unknown>;
}

async function searchHlplanet(query: string, limit: number): Promise<ToolResult> {
  const url = `${SITE}wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=${limit}&_fields=title,url,subtype`;
  const searchUrl = `${SITE}?s=${encodeURIComponent(query)}`;
  let found: { title: string; url: string; subtype?: string }[];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': `hlplanet-mcp/${VERSION} (+https://api.hlplanet.com/)`, Accept: 'application/json' } });
    if (!res.ok) throw new LookupError(`HLPlanet search failed (HTTP ${res.status}). Search directly at ${searchUrl}`);
    found = (await res.json()) as typeof found;
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw new LookupError(`HLPlanet search is unreachable. Search directly at ${searchUrl}`);
  }
  const results = found.map((r) => ({ title: decodeEntities(r.title), url: r.url, type: r.subtype ?? 'post' }));
  const data = { query, results, search_url: searchUrl };
  if (!results.length) return { text: `No HLPlanet articles match "${query}". Browse all reviews at ${SITE}`, data };
  return { text: [`HLPlanet results for "${query}":`, '', ...results.map((r) => `- ${r.title}: ${r.url}`)].join('\n'), data };
}

/** Structured twin of dimensionsText: same filtering, same order. */
function dimensionsData(query?: string, size?: string): Record<string, unknown> {
  let models = MODELS;
  if (size) {
    const def = resolveBoard(size).layout;
    models = models.filter((m) => m.layout === def.id);
  }
  if (query) {
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    models = models.filter((m) => words.every((w) => m.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(w)));
  }
  if (!models.length && query) {
    const b = resolveBoard(query);
    return { keyboards: [], count: 0, standard_size: sizeJson(b.layout) };
  }
  const boards = models.map((m) => modelBoard(m)).sort((a, b) => b.widthMm - a.widthMm);
  return { keyboards: boards.map(keyboardJson), count: boards.length };
}

const params = (entries: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(Object.entries(entries).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));

async function callTool(name: string, a: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case 'list_keyboard_sizes':
      return { text: listSizesText(), data: listSizes() };
    case 'compare_keyboards': {
      const keyboards = list(a, 'keyboards', 2, 6);
      const text = compareText(keyboards, a.iso === true);
      return { text, data: compare(params({ items: keyboards.join(','), iso: a.iso === true })) };
    }
    case 'get_keyboard_dimensions': {
      const query = str(a, 'query');
      const size = str(a, 'size');
      return { text: dimensionsText(query, size), data: dimensionsData(query, size) };
    }
    case 'check_desk_fit': {
      const args: DeskFitArgs = {
        keyboards: list(a, 'keyboards', 1, 6),
        desk_width_cm: num(a, 'desk_width_cm', true)!,
        mousepad: str(a, 'mousepad'),
        mousepad_width_cm: num(a, 'mousepad_width_cm'),
        cm_per_360: num(a, 'cm_per_360'),
        left_handed: a.left_handed === true,
        keyboard_offset_cm: num(a, 'keyboard_offset_cm')
      };
      if (args.desk_width_cm < 30 || args.desk_width_cm > 400) throw new InvalidParams('"desk_width_cm" must be between 30 and 400.');
      if (args.mousepad && !['small', 'medium', 'large', 'xl', 'deskmat', 'custom'].includes(args.mousepad)) throw new InvalidParams('"mousepad" must be small, medium, large, xl, deskmat or custom.');
      const text = deskFitText(args);
      const results = args.keyboards.map((keyboard) =>
        deskFitJson(
          params({
            keyboard,
            desk_width_cm: args.desk_width_cm,
            mousepad: args.mousepad,
            mousepad_width_cm: args.mousepad_width_cm,
            cm_per_360: args.cm_per_360,
            left_handed: args.left_handed,
            keyboard_offset_cm: args.keyboard_offset_cm
          })
        )
      );
      return { text, data: { results } };
    }
    case 'which_sizes_have_key': {
      const key = str(a, 'key', true)!;
      return { text: whichSizesHaveKeyText(key, a.iso === true), data: keyAvailability(key, params({ iso: a.iso === true })) };
    }
    case 'search_hlplanet': {
      const query = str(a, 'query', true)!;
      if (query.length > 100) throw new InvalidParams('"query" must be at most 100 characters.');
      const limit = Math.min(10, Math.max(1, Math.round(num(a, 'limit') ?? 5)));
      return searchHlplanet(query, limit);
    }
    case 'list_testing_tools':
      return { text: ['Free HLPlanet tools:', '', ...TESTING_TOOLS.map(([n, u, d]) => `- ${n}: ${u}\n  ${d}`)].join('\n'), data: tools() };
  }
  throw new InvalidParams(`Unknown tool "${name}".`);
}

type JsonRpcId = string | number | null;
const result = (id: JsonRpcId, value: unknown) => ({ jsonrpc: '2.0', id, result: value });
const error = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** Handle one JSON-RPC message. Returns null for notifications and responses (nothing to send back). */
export async function handleMessage(msg: unknown): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || (msg as { jsonrpc?: unknown }).jsonrpc !== '2.0') {
    return error(null, -32600, 'Invalid JSON-RPC request.');
  }
  const m = msg as { id?: JsonRpcId; method?: unknown; params?: Record<string, unknown> };
  const isNotification = !('id' in m);
  if (typeof m.method !== 'string') return isNotification ? null : error(m.id ?? null, -32600, 'Missing method.');
  if (isNotification) return null;
  const id = m.id ?? null;
  const params = m.params && typeof m.params === 'object' ? m.params : {};

  switch (m.method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      return result(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hlplanet-mcp', title: TITLE, version: VERSION, description: DESCRIPTION, websiteUrl: SIZE_TOOL_URL, icons: ICONS },
        instructions: INSTRUCTIONS
      });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: TOOLS });
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      if (!TOOLS.some((t) => t.name === name)) return error(id, -32602, `Unknown tool "${name}".`);
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {};
      try {
        const { text, data } = await callTool(name, args);
        return result(id, { content: [{ type: 'text', text }], structuredContent: data });
      } catch (err) {
        if (err instanceof LookupError || err instanceof InvalidParams || err instanceof ApiError) {
          return result(id, { content: [{ type: 'text', text: err.message }], isError: true });
        }
        return result(id, { content: [{ type: 'text', text: 'The tool failed unexpectedly. Try again later.' }], isError: true });
      }
    }
    case 'resources/list':
      return result(id, { resources: [] });
    case 'prompts/list':
      return result(id, { prompts: [] });
  }
  return error(id, -32601, `Method not found: ${m.method}`);
}

/** MCP Server Card (experimental-ext-server-card v1), served at /mcp/server-card. */
export function serverCard() {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: 'io.github.hlplanet/hlplanet-mcp',
    version: VERSION,
    title: TITLE,
    description: CARD_DESCRIPTION,
    websiteUrl: SIZE_TOOL_URL,
    icons: ICONS,
    remotes: [{ type: 'streamable-http', url: MCP_URL, supportedProtocolVersions: PROTOCOL_VERSIONS }]
  };
}

/** AI Catalog for domain-level discovery, served at /.well-known/ai-catalog.json. */
export function aiCatalog() {
  return {
    specVersion: '1.0',
    entries: [{ identifier: 'urn:air:hlplanet.com:mcp:keyboard-sizes', type: 'application/mcp-server-card+json', url: MCP_URL + '/server-card' }]
  };
}

const MCP_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400'
};

export async function handleMcp(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: MCP_CORS });
  if (request.method === 'GET' || request.method === 'DELETE') {
    // Stateless server: no server-initiated stream and no sessions to end
    return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS', ...MCP_CORS } });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS', ...MCP_CORS } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(error(null, -32700, 'Parse error: the body must be JSON.'), { status: 400, headers: MCP_CORS });
  }
  if (Array.isArray(body)) {
    return Response.json(error(null, -32600, 'Batched requests are not supported.'), { status: 400, headers: MCP_CORS });
  }
  const reply = await handleMessage(body);
  if (!reply) return new Response(null, { status: 202, headers: MCP_CORS });
  return Response.json(reply, { headers: { 'Cache-Control': 'no-store', ...MCP_CORS } });
}
