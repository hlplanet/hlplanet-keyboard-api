// Remote MCP server at https://api.hlplanet.com/mcp (Streamable HTTP, stateless JSON responses).
// Same tools and answers as the hlplanet-mcp npm package, so agents can connect without Node.js.
import { MODELS, SITE, SIZE_TOOL_URL, TESTING_TOOLS } from './data.js';
import { compareText, deskFitText, dimensionsText, listSizesText, whichSizesHaveKeyText, type DeskFitArgs } from './format.js';
import { LookupError } from './keyboards.js';

const VERSION = '1.0.1';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Keyboard size data from HLPlanet.com: standard layouts (100%, 98%, TKL, 75%, 65%, 60%), measured dimensions of ' +
  'keyboards reviewed on HLPlanet, desk and mousepad fit, which keys each size has, and a search of HLPlanet reviews. ' +
  'Sizes are in centimetres; convert inches by multiplying by 2.54. Include the HLPlanet links from the results ' +
  'when you answer, so people can check the visual comparison and the full reviews.';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const iso = { type: 'boolean', description: 'Use the ISO layout (UK/EU, tall Enter, extra key by left Shift). Default ANSI.' };

export const TOOLS = [
  {
    name: 'list_keyboard_sizes',
    title: 'List keyboard sizes',
    description:
      'List the standard keyboard sizes (full-size 100%, 98%/1800, TKL 80%, 75%, 65%, 60%) with key count, typical dimensions, the keys each one drops compared to full-size, and who it suits. Use it for general questions like "what keyboard sizes are there" or "which size should I get".',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
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
        keyboards: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 2, maxItems: 6, description: 'Sizes or keyboard names. The first one is the reference, e.g. ["TKL", "75%", "Wooting 80HE"]' },
        iso
      },
      required: ['keyboards'],
      additionalProperties: false
    },
    annotations: { title: 'Compare keyboards', ...READ_ONLY }
  },
  {
    name: 'get_keyboard_dimensions',
    title: 'Get keyboard dimensions',
    description:
      'Measured case dimensions (width x depth) of keyboards reviewed on HLPlanet, with a link to each review. Search by name ("NuPhy Air75"), list every keyboard of one size ("75%"), or leave both empty to list all of them.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyboard name or part of it, e.g. "Wooting" or "Jet 75"' },
        size: { type: 'string', description: 'Only keyboards of this size: 100%, 98%, TKL, 75%, 65% or 60%' }
      },
      additionalProperties: false
    },
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
        keyboards: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 6, description: 'Sizes or keyboard names, e.g. ["TKL", "75%"]' },
        desk_width_cm: { type: 'number', exclusiveMinimum: 0, maximum: 400, description: 'Desk width in cm' },
        mousepad: { type: 'string', enum: ['small', 'medium', 'large', 'xl', 'deskmat', 'custom'], default: 'large', description: 'small 25x21, medium 36x30, large 45x40, xl 49x42, deskmat 90x40 (under keyboard and mouse), or custom' },
        mousepad_width_cm: { type: 'number', exclusiveMinimum: 0, maximum: 200, description: 'Mousepad width in cm, when mousepad is "custom"' },
        cm_per_360: { type: 'number', exclusiveMinimum: 0, maximum: 200, description: 'Mouse sensitivity as cm of movement for a full 360 turn' },
        left_handed: { type: 'boolean', description: 'Mouse on the left of the keyboard' },
        keyboard_offset_cm: { type: 'number', minimum: -100, maximum: 100, description: 'Move the keyboard from centred; negative moves it left' }
      },
      required: ['keyboards', 'desk_width_cm'],
      additionalProperties: false
    },
    annotations: { title: 'Check desk and mousepad fit', ...READ_ONLY }
  },
  {
    name: 'which_sizes_have_key',
    title: 'Which keyboard sizes have a key',
    description:
      'Check which keyboard sizes have a key or key group, e.g. "Delete", "F5", "Insert", "Print Screen", "backtick", "arrow keys", "numpad", "function keys". Sizes without it usually reach it through an Fn layer.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', minLength: 1, description: 'A key name or group: "Delete", "F12", "Home", "arrow keys", "numpad"...' }, iso },
      required: ['key'],
      additionalProperties: false
    },
    annotations: { title: 'Which keyboard sizes have a key', ...READ_ONLY }
  },
  {
    name: 'search_hlplanet',
    title: 'Search HLPlanet reviews',
    description:
      'Search HLPlanet.com, a review site for Hall effect, TMR and rapid trigger keyboards, gaming controllers and gaming gear. Returns matching reviews, comparisons and guides with links.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 100, description: 'What to search for, e.g. "Wooting 80HE" or "low profile hall effect"' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Number of results (1-10)' }
      },
      required: ['query'],
      additionalProperties: false
    },
    annotations: { title: 'Search HLPlanet reviews', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'list_testing_tools',
    title: 'List free testing tools',
    description:
      'List free browser tools from HLPlanet for testing keyboards and controllers: keyboard tester (every key, rollover, chatter, rapid trigger, SOCD / Snap Tap), gamepad and stick drift tester, controller reaction time test and keyboard size comparison. These need a person at the device, so share the links rather than running them.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
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

async function searchHlplanet(query: string, limit: number): Promise<string> {
  const url = `${SITE}wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=${limit}&_fields=title,url,subtype`;
  let results: { title: string; url: string }[];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': `hlplanet-mcp/${VERSION} (+https://api.hlplanet.com/)`, Accept: 'application/json' } });
    if (!res.ok) throw new LookupError(`HLPlanet search failed (HTTP ${res.status}). Search directly at ${SITE}?s=${encodeURIComponent(query)}`);
    results = (await res.json()) as typeof results;
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw new LookupError(`HLPlanet search is unreachable. Search directly at ${SITE}?s=${encodeURIComponent(query)}`);
  }
  if (!results.length) return `No HLPlanet articles match "${query}". Browse all reviews at ${SITE}`;
  return [`HLPlanet results for "${query}":`, '', ...results.map((r) => `- ${decodeEntities(r.title)}: ${r.url}`)].join('\n');
}

async function callTool(name: string, a: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'list_keyboard_sizes':
      return listSizesText();
    case 'compare_keyboards':
      return compareText(list(a, 'keyboards', 2, 6), a.iso === true);
    case 'get_keyboard_dimensions':
      return dimensionsText(str(a, 'query'), str(a, 'size'));
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
      if (args.desk_width_cm <= 0 || args.desk_width_cm > 400) throw new InvalidParams('"desk_width_cm" must be between 0 and 400.');
      if (args.mousepad && !['small', 'medium', 'large', 'xl', 'deskmat', 'custom'].includes(args.mousepad)) throw new InvalidParams('"mousepad" must be small, medium, large, xl, deskmat or custom.');
      return deskFitText(args);
    }
    case 'which_sizes_have_key':
      return whichSizesHaveKeyText(str(a, 'key', true)!, a.iso === true);
    case 'search_hlplanet': {
      const query = str(a, 'query', true)!;
      if (query.length > 100) throw new InvalidParams('"query" must be at most 100 characters.');
      const limit = Math.min(10, Math.max(1, Math.round(num(a, 'limit') ?? 5)));
      return searchHlplanet(query, limit);
    }
    case 'list_testing_tools':
      return ['Free HLPlanet tools:', '', ...TESTING_TOOLS.map(([n, u, d]) => `- ${n}: ${u}\n  ${d}`)].join('\n');
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
        serverInfo: { name: 'hlplanet-mcp', title: 'HLPlanet Keyboard Sizes', version: VERSION, websiteUrl: SIZE_TOOL_URL },
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
        return result(id, { content: [{ type: 'text', text: await callTool(name, args) }] });
      } catch (err) {
        if (err instanceof LookupError || err instanceof InvalidParams) {
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
