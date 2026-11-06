// Documentation pages, llms.txt and the OpenAPI document. Every page exists as HTML at its path and as
// Markdown at the same path plus ".md". Examples are produced by the real handlers, so they never drift.
import { SITE, SIZE_TOOL_URL } from './data.js';
import { compare, deskFitJson, getKeyboard, getSize, keyAvailability, tools } from './api.js';
import { escapeHtml, renderMarkdown } from './markdown.js';

export const BASE = 'https://api.hlplanet.com';
const KEYBOARD_TESTER = SITE + 'online-keyboard-tester-tool/';

const json = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
const q = (s: string) => new URLSearchParams(s);

function trimKeySets<T>(v: T): T {
  // Keep examples short: show the first few key codes only
  return JSON.parse(JSON.stringify(v, (k, val) => (k === 'codes' && Array.isArray(val) && val.length > 6 ? [...val.slice(0, 6), '…'] : val)));
}

export interface Page {
  path: string; // HTML path; Markdown lives at path + '.md' ('/' becomes '/index.md')
  title: string;
  summary: string;
  body: () => string;
}

export const PAGES: Page[] = [
  {
    path: '/',
    title: 'HLPlanet Keyboard API',
    summary: 'Overview, base URL, quick start and the list of endpoints.',
    body: () => `Free JSON API for keyboard size data: the standard layouts from full-size to 60%, the measured case size of 30 keyboards reviewed on [HLPlanet](${SITE}), side-by-side comparisons, desk and mousepad fit, and which sizes have a given key. It returns the same numbers as the [HLPlanet keyboard size comparison](${SIZE_TOOL_URL}), which draws every layout to scale.

## Base URL

\`\`\`text
${BASE}/v1
\`\`\`

No API key or sign-up. Responses are JSON, served with \`Access-Control-Allow-Origin: *\` so you can call the API from a browser.

## Quick start

\`\`\`bash
curl "${BASE}/v1/compare?items=tkl,75"
\`\`\`

\`\`\`javascript
const res = await fetch("${BASE}/v1/desk-fit?keyboard=tkl&desk_width_cm=120&mousepad=large");
const fit = await res.json();
console.log(fit.mouse_room_cm, fit.pad_fits);
\`\`\`

## Endpoints

| Method and path | What it returns |
|---|---|
| \`GET /v1/sizes\` | Every standard size with key count, typical dimensions and missing keys. [Docs](${BASE}/docs/sizes) |
| \`GET /v1/sizes/{id}\` | One size: \`full\`, \`1800\`, \`tkl\`, \`75\`, \`65\` or \`60\`. [Docs](${BASE}/docs/sizes) |
| \`GET /v1/keyboards\` | The 30 measured keyboards, filterable by \`size\` and \`q\`. [Docs](${BASE}/docs/keyboards) |
| \`GET /v1/keyboards/{id}\` | One measured keyboard with its review link. [Docs](${BASE}/docs/keyboards) |
| \`GET /v1/compare\` | Two to six sizes or keyboards side by side. [Docs](${BASE}/docs/compare) |
| \`GET /v1/desk-fit\` | Whether a keyboard and mousepad fit on a desk. [Docs](${BASE}/docs/desk-fit) |
| \`GET /v1/keys/{key}\` | Which sizes have a key or key group. [Docs](${BASE}/docs/keys) |
| \`GET /v1/tools\` | Free HLPlanet keyboard and controller testers. [Docs](${BASE}/docs/tools) |

Errors use one JSON shape for every endpoint: see [Errors](${BASE}/docs/errors).

## MCP server for AI assistants

The same data is available as MCP tools at \`${BASE}/mcp\` (Streamable HTTP, no sign-in). Claude, Cursor, VS Code and Hermes Agent can connect to it directly: see [MCP server](${BASE}/docs/mcp).

## Machine-readable docs

- [OpenAPI 3.0 specification](${BASE}/openapi.json) for Postman, RapidAPI and code generators.
- [llms.txt](${BASE}/llms.txt) indexes these docs for AI agents. Every page is also available as Markdown: add \`.md\` to its URL, or send \`Accept: text/markdown\`.

## Attribution

The API is free to use. When you publish its numbers, please credit **HLPlanet** with a link to ${SIZE_TOOL_URL}. Every response that comes from the size comparison includes a \`compare_url\` or \`source\` you can link to.

## Where the numbers come from

Standard sizes are built from their key layouts with 19.05 mm per key plus an estimated 10 mm case border. Measured keyboards use the case width and depth from each HLPlanet review. Once you have a keyboard, check every key, rollover and chatter with the free [HLPlanet keyboard tester](${KEYBOARD_TESTER}).`
  },
  {
    path: '/docs/sizes',
    title: 'Keyboard sizes',
    summary: 'GET /v1/sizes and GET /v1/sizes/{id}: standard layouts from full-size to 60%.',
    body: () => `\`GET /v1/sizes\` lists the six standard sizes. \`GET /v1/sizes/{id}\` returns one of them.

## Size ids

| id | Size | Also accepted |
|---|---|---|
| \`full\` | Full-size (100%) | \`100\`, \`104\` |
| \`1800\` | 98% (1800) | \`98\`, \`96\` |
| \`tkl\` | TKL, tenkeyless (80%) | \`80\`, \`87\` |
| \`75\` | 75% | \`84\` |
| \`65\` | 65% | \`68\` |
| \`60\` | 60% | \`61\` |

## Fields

| Field | Meaning |
|---|---|
| \`keys\` | Number of keys in the ANSI layout |
| \`typical_width_mm\`, \`typical_depth_mm\` | Estimated case size: 19.05 mm per key plus about 10 mm of case border |
| \`narrower_than_full_size_mm\` | Width saved compared to a full-size keyboard |
| \`missing_vs_full_size\` | Keys this size drops, as a readable \`summary\`, a \`count\` and the KeyboardEvent \`codes\` |
| \`reviews\` | Example keyboards of this size reviewed on HLPlanet |
| \`compare_url\` | The size drawn to scale on HLPlanet |

## Example

\`\`\`bash
curl "${BASE}/v1/sizes/75"
\`\`\`

${json(trimKeySets(getSize('75')))}`
  },
  {
    path: '/docs/keyboards',
    title: 'Measured keyboards',
    summary: 'GET /v1/keyboards and GET /v1/keyboards/{id}: case sizes measured in HLPlanet reviews.',
    body: () => `\`GET /v1/keyboards\` lists 30 keyboards with the case width and depth measured in their HLPlanet review. \`GET /v1/keyboards/{id}\` returns one keyboard.

## Query parameters for the list

| Parameter | Example | Meaning |
|---|---|---|
| \`size\` | \`75\` | Only keyboards of this size (any id from [Sizes](${BASE}/docs/sizes)) |
| \`q\` | \`wooting\` | Every word must appear in the keyboard name |

## Example

\`\`\`bash
curl "${BASE}/v1/keyboards/wooting-80he"
\`\`\`

${json(getKeyboard('wooting-80he'))}

The \`id\` values come from the list endpoint, for example \`nuphy-air75-he\`, \`mchose-jet75\` or \`drunkdeer-g60\`. A unique name also works: \`/v1/keyboards/jet%2075\`.`
  },
  {
    path: '/docs/compare',
    title: 'Compare keyboards',
    summary: 'GET /v1/compare: two to six sizes or keyboards side by side, with width, depth and key differences.',
    body: () => `\`GET /v1/compare\` puts two to six sizes or measured keyboards side by side. The first item is the reference; every other item reports its difference from it.

## Query parameters

| Parameter | Example | Meaning |
|---|---|---|
| \`items\` | \`tkl,75,wooting-80he\` | Required. 2 to 6 comma-separated size ids or keyboard ids |
| \`iso\` | \`true\` | Use the ISO layout (UK/EU: tall Enter, extra key next to left Shift). Default ANSI |

Negative \`width_diff_mm\` means the item is narrower than the reference, which leaves that much more room for the mouse. \`missing_keys\` are keys the reference has and the item lacks; they are usually on an Fn layer.

## Example

\`\`\`bash
curl "${BASE}/v1/compare?items=tkl,75"
\`\`\`

${json(trimKeySets(compare(q('items=tkl,75'))))}`
  },
  {
    path: '/docs/desk-fit',
    title: 'Desk fit',
    summary: 'GET /v1/desk-fit: whether a keyboard and mousepad fit side by side on a desk, and whether a 360° turn fits.',
    body: () => `\`GET /v1/desk-fit\` places a keyboard on a desk with its B key in front of the screen centre and a mousepad 3 cm to its side, then reports how the mousepad fits.

## Query parameters

| Parameter | Example | Meaning |
|---|---|---|
| \`keyboard\` | \`tkl\` | Required. A size id or keyboard id |
| \`desk_width_cm\` | \`120\` | Required. Desk width, 30 to 400 cm |
| \`mousepad\` | \`large\` | \`small\` 25×21, \`medium\` 36×30, \`large\` 45×40 (default), \`xl\` 49×42, \`deskmat\` 90×40 under keyboard and mouse, or \`custom\` |
| \`mousepad_width_cm\` | \`80\` | Required when \`mousepad=custom\` |
| \`cm_per_360\` | \`40\` | Mouse sensitivity in cm per full turn; adds \`turn_360\` to the result |
| \`left_handed\` | \`true\` | Mousepad on the left of the keyboard |
| \`keyboard_offset_cm\` | \`-5\` | Move the keyboard from centred; negative moves it left |

## Example

\`\`\`bash
curl "${BASE}/v1/desk-fit?keyboard=tkl&desk_width_cm=120&mousepad=large&cm_per_360=40"
\`\`\`

${json(deskFitJson(q('keyboard=tkl&desk_width_cm=120&mousepad=large&cm_per_360=40')))}

When the pad doesn't fit, \`tip\` says how far to slide the keyboard, or \`desk_too_narrow_by_cm\` says the desk is too small for both.`
  },
  {
    path: '/docs/keys',
    title: 'Find a key',
    summary: 'GET /v1/keys/{key}: which keyboard sizes have a key or key group, such as Delete, F5 or the numpad.',
    body: () => `\`GET /v1/keys/{key}\` tells you which sizes keep a key. Sizes without it usually reach it through an Fn layer.

## Key names

Use a key or a group, with hyphens or URL-encoded spaces: \`delete\`, \`insert\`, \`home\`, \`end\`, \`page-up\`, \`page-down\`, \`print-screen\`, \`f1\` to \`f12\`, \`esc\`, \`backtick\`, \`right-ctrl\`, \`menu\`, \`arrow-keys\`, \`f-keys\`, \`navigation-keys\` or \`numpad\`. Add \`?iso=true\` for UK/EU layouts.

## Example

\`\`\`bash
curl "${BASE}/v1/keys/f5"
\`\`\`

${json(keyAvailability('f5', q('')))}`
  },
  {
    path: '/docs/tools',
    title: 'Testing tools',
    summary: 'GET /v1/tools: free HLPlanet browser tools for testing keyboards and controllers.',
    body: () => `\`GET /v1/tools\` lists free HLPlanet tools for testing keyboards and controllers. They run in the browser and need a person at the device, so share the links rather than calling them.

## Example

\`\`\`bash
curl "${BASE}/v1/tools"
\`\`\`

${json(tools())}`
  },
  {
    path: '/docs/mcp',
    title: 'MCP server',
    summary: 'Remote MCP server at /mcp: the keyboard data as tools for Claude, Cursor, VS Code and Hermes Agent.',
    body: () => `The API is also an [MCP](https://modelcontextprotocol.io) server, so AI assistants can answer keyboard size questions with these numbers instead of guessing.

## Endpoint

\`\`\`text
${BASE}/mcp
\`\`\`

Streamable HTTP transport, stateless, no sign-in or API key. Every tool is read-only.

## Tools

| Tool | What it does |
|---|---|
| \`list_keyboard_sizes\` | Every standard size with key count, typical dimensions, missing keys and who it suits |
| \`compare_keyboards\` | Compare 2–6 sizes or measured keyboards: width, depth, keys lost or gained, mouse room |
| \`get_keyboard_dimensions\` | Measured case size of keyboards reviewed on HLPlanet, by name or size |
| \`check_desk_fit\` | Keyboard and mousepad on a desk: room left, pad overhang, 360° turn fit |
| \`which_sizes_have_key\` | Which sizes have a key or key group |
| \`search_hlplanet\` | Search HLPlanet reviews, comparisons and guides |
| \`list_testing_tools\` | Free HLPlanet keyboard and controller testers |

## Connect

Claude Code:

\`\`\`bash
claude mcp add --transport http hlplanet ${BASE}/mcp
\`\`\`

Cursor, VS Code and other clients that read an \`mcpServers\` file:

\`\`\`json
{
  "mcpServers": {
    "hlplanet": { "url": "${BASE}/mcp" }
  }
}
\`\`\`

Hermes Agent: install the HLPlanet plugin, which connects to this server and adds a keyboard size skill:

\`\`\`bash
hermes plugins install hlplanet/hlplanet-cursor-plugin
\`\`\`

Prefer a local server? The same tools run offline with \`npx -y hlplanet-mcp\` ([source](https://github.com/hlplanet/hlplanet-mcp)).

## Privacy

The server keeps no logs of tool arguments and sets no cookies. \`search_hlplanet\` sends the search text to the HLPlanet site search; every other tool answers from data built into the server.`
  },
  {
    path: '/docs/errors',
    title: 'Errors',
    summary: 'Error format and codes shared by every endpoint.',
    body: () => `Every error returns a non-2xx status and the same JSON shape:

\`\`\`json
{
  "error": {
    "code": "unknown_keyboard",
    "message": "Unknown keyboard or size \\"banana\\". Use a size (100%, 98%, TKL, 75%, 65%, 60%) or one of these keyboards: …"
  }
}
\`\`\`

| Status | code | When |
|---|---|---|
| 400 | \`missing_parameter\` | A required query parameter is missing |
| 400 | \`invalid_parameter\` | A parameter is out of range or not one of the allowed values |
| 400 | \`unknown_keyboard\` | An item is neither a size nor a known keyboard |
| 400 | \`unknown_size\` | The \`size\` filter is not a known size |
| 404 | \`unknown_size\`, \`unknown_keyboard\`, \`unknown_key\` | The path names something that doesn't exist |
| 404 | \`not_found\` | No such endpoint |
| 405 | \`method_not_allowed\` | Only \`GET\`, \`HEAD\` and \`OPTIONS\` are supported |

Messages are written for people and can change; match on \`code\`.`
  }
];

export function markdownPath(page: Page): string {
  return page.path === '/' ? '/index.md' : page.path + '.md';
}

export function pageMarkdown(page: Page): string {
  return `> Documentation index: ${BASE}/llms.txt. Every page is also available as Markdown by adding .md to its URL.

# ${page.title}

${page.body()}
`;
}

const CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#1d1d1f;--muted:#5f6368;--line:#e3e3e8;--code:#f4f4f6;--accent:#0a7cff}
@media (prefers-color-scheme:dark){:root{--bg:#121214;--fg:#ececf1;--muted:#a1a1aa;--line:#2a2a30;--code:#1c1c21;--accent:#4ea3ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:24px 16px 64px}header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:24px}
header a{color:var(--muted);text-decoration:none;font-size:14px}header a.home{color:var(--fg);font-weight:700;font-size:16px;margin-right:auto}
a{color:var(--accent)}h1{font-size:32px;line-height:1.2}h2{margin-top:36px}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.9em}
pre{background:var(--code);padding:14px;border-radius:8px;overflow-x:auto}pre code{padding:0;background:none}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
blockquote{margin:0;padding:4px 16px;border-left:3px solid var(--line);color:var(--muted)}footer{margin-top:48px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:14px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;

export function pageHtml(page: Page): string {
  const nav = PAGES.map((p) => `<a href="${p.path}"${p.path === '/' ? ' class="home"' : ''}>${escapeHtml(p.path === '/' ? 'HLPlanet Keyboard API' : p.title)}</a>`).join('');
  const title = page.path === '/' ? 'HLPlanet Keyboard API: keyboard sizes, dimensions and desk fit' : `${page.title} · HLPlanet Keyboard API`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.summary)}">
<link rel="canonical" href="${BASE}${page.path}">
<link rel="alternate" type="text/markdown" href="${BASE}${markdownPath(page)}">
<link rel="icon" href="https://www.hlplanet.com/favicon.ico">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<p class="sr-only">For AI agents: the documentation index is at <a href="${BASE}/llms.txt">${BASE}/llms.txt</a>. This page is also available as Markdown at <a href="${BASE}${markdownPath(page)}">${BASE}${markdownPath(page)}</a>.</p>
<header>${nav}<a href="${BASE}/openapi.json">OpenAPI</a></header>
<main>
<h1>${escapeHtml(page.title)}</h1>
${renderMarkdown(page.body())}
</main>
<footer>Data from the <a href="${SIZE_TOOL_URL}">HLPlanet keyboard size comparison</a> and <a href="${SITE}">HLPlanet</a> keyboard reviews · <a href="https://github.com/hlplanet/hlplanet-keyboard-api">Source on GitHub</a> · <a href="${markdownPath(page)}">Markdown</a></footer>
</div>
</body>
</html>`;
}

export function llmsTxt(): string {
  const docs = PAGES.map((p) => `- [${p.path === '/' ? 'Overview' : p.title}](${BASE}${markdownPath(p)}): ${p.summary}`).join('\n');
  return `# HLPlanet Keyboard API

> Free JSON API for keyboard size data from HLPlanet: standard layouts from full-size to 60%, the measured case size of 30 keyboards, side-by-side comparisons, desk and mousepad fit, and which sizes have a given key. No API key. Base URL: ${BASE}/v1

Every docs page is available as HTML and as Markdown (add .md to the URL, or send Accept: text/markdown).

## Docs

${docs}

## Reference

- [OpenAPI 3.0 specification](${BASE}/openapi.json): every endpoint, parameter and response.

## Optional

- [HLPlanet keyboard size comparison](${SIZE_TOOL_URL}): the interactive tool that draws these layouts to scale.
- [HLPlanet MCP server](https://github.com/hlplanet/hlplanet-mcp): the same data as MCP tools for AI assistants (npx -y hlplanet-mcp).
`;
}

// ---- OpenAPI ----

const err = { $ref: '#/components/responses/Error' };
const obj = (description: string) => ({ description, content: { 'application/json': { schema: { type: 'object' } } } });
const param = (name: string, where: 'query' | 'path', description: string, schema: Record<string, unknown>, required = false, example?: unknown) => ({
  name,
  in: where,
  required: where === 'path' ? true : required,
  description,
  schema,
  ...(example !== undefined ? { example } : {})
});
const sizeId = { type: 'string', example: '75' };
const iso = param('iso', 'query', 'Use the ISO layout (UK/EU). Default ANSI.', { type: 'boolean', default: false });

export function openApi() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'HLPlanet Keyboard API',
      version: '1.0.0',
      description:
        'Keyboard size data from HLPlanet: standard layouts from full-size to 60%, measured case sizes of 30 keyboards, comparisons, desk and mousepad fit, and which sizes have a key. Free, no API key. Please credit HLPlanet (https://www.hlplanet.com/keyboard-layout/) when you publish the numbers.',
      contact: { name: 'HLPlanet', url: SITE },
      license: { name: 'MIT', url: 'https://github.com/hlplanet/hlplanet-keyboard-api/blob/main/LICENSE' }
    },
    externalDocs: { description: 'Documentation', url: BASE + '/' },
    servers: [{ url: BASE + '/v1' }],
    tags: [{ name: 'Sizes' }, { name: 'Keyboards' }, { name: 'Tools' }],
    paths: {
      '/sizes': { get: { tags: ['Sizes'], operationId: 'listSizes', summary: 'List keyboard sizes', description: 'Every standard size with key count, typical dimensions, missing keys and example reviews.', responses: { 200: obj('The six standard sizes') } } },
      '/sizes/{id}': {
        get: {
          tags: ['Sizes'], operationId: 'getSize', summary: 'Get one keyboard size',
          parameters: [param('id', 'path', 'Size id: full, 1800, tkl, 75, 65 or 60', sizeId)],
          responses: { 200: obj('One size'), 404: err }
        }
      },
      '/keyboards': {
        get: {
          tags: ['Keyboards'], operationId: 'listKeyboards', summary: 'List measured keyboards',
          parameters: [param('size', 'query', 'Only keyboards of this size', sizeId), param('q', 'query', 'Every word must appear in the name', { type: 'string' }, false, 'nuphy')],
          responses: { 200: obj('Measured keyboards'), 400: err }
        }
      },
      '/keyboards/{id}': {
        get: {
          tags: ['Keyboards'], operationId: 'getKeyboard', summary: 'Get one measured keyboard',
          parameters: [param('id', 'path', 'Keyboard id from the list, e.g. wooting-80he', { type: 'string', example: 'wooting-80he' })],
          responses: { 200: obj('One keyboard with its HLPlanet review link'), 404: err }
        }
      },
      '/compare': {
        get: {
          tags: ['Keyboards'], operationId: 'compareKeyboards', summary: 'Compare sizes or keyboards',
          parameters: [param('items', 'query', '2 to 6 comma-separated size ids or keyboard ids; the first is the reference', { type: 'string' }, true, 'tkl,75'), iso],
          responses: { 200: obj('Differences from the reference'), 400: err }
        }
      },
      '/desk-fit': {
        get: {
          tags: ['Keyboards'], operationId: 'checkDeskFit', summary: 'Check desk and mousepad fit',
          parameters: [
            param('keyboard', 'query', 'Size id or keyboard id', { type: 'string' }, true, 'tkl'),
            param('desk_width_cm', 'query', 'Desk width in cm', { type: 'number', minimum: 30, maximum: 400 }, true, 120),
            param('mousepad', 'query', 'Mousepad size', { type: 'string', enum: ['small', 'medium', 'large', 'xl', 'deskmat', 'custom'], default: 'large' }),
            param('mousepad_width_cm', 'query', 'Mousepad width in cm, required when mousepad=custom', { type: 'number', minimum: 5, maximum: 200 }),
            param('cm_per_360', 'query', 'Mouse sensitivity in cm per 360° turn', { type: 'number', minimum: 1, maximum: 200 }),
            param('left_handed', 'query', 'Mousepad on the left', { type: 'boolean', default: false }),
            param('keyboard_offset_cm', 'query', 'Move the keyboard from centred; negative moves it left', { type: 'number', minimum: -100, maximum: 100 })
          ],
          responses: { 200: obj('Desk fit result'), 400: err }
        }
      },
      '/keys/{key}': {
        get: {
          tags: ['Sizes'], operationId: 'whichSizesHaveKey', summary: 'Which sizes have a key',
          parameters: [param('key', 'path', 'Key or group: delete, f5, page-up, print-screen, arrow-keys, numpad…', { type: 'string', example: 'delete' }), iso],
          responses: { 200: obj('Availability per size'), 404: err }
        }
      },
      '/tools': { get: { tags: ['Tools'], operationId: 'listTestingTools', summary: 'List free HLPlanet testing tools', responses: { 200: obj('Keyboard and controller testers') } } }
    },
    components: {
      responses: {
        Error: {
          description: 'Error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] } }
              }
            }
          }
        }
      }
    }
  };
}
