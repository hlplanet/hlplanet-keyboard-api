import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { TOOLS } from '../src/mcp.js';

const rpc = async (body: unknown, method = 'POST') => {
  const res = await worker.fetch(
    new Request('https://api.hlplanet.com/mcp', {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    })
  );
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), body: text ? JSON.parse(text) : null };
};
const call = (name: string, args: Record<string, unknown> = {}) =>
  rpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } });

afterEach(() => vi.unstubAllGlobals());

// Just enough JSON Schema to check structuredContent against each tool's outputSchema
function validate(schema: any, value: unknown, path = '$'): string[] {
  const types: string[] = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const is = (t: string) =>
    t === 'null' ? value === null
    : t === 'array' ? Array.isArray(value)
    : t === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value)
    : t === 'integer' ? Number.isInteger(value)
    : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : typeof value === t;
  if (types.length && !types.some(is)) return [`${path}: expected ${types.join('|')}, got ${JSON.stringify(value)}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: ${JSON.stringify(value)} not in enum`];
  const errors: string[] = [];
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}[${i}]`)));
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${path}.${k}: missing`);
    for (const [k, v] of Object.entries(value)) if (schema.properties[k]) errors.push(...validate(schema.properties[k], v, `${path}.${k}`));
  }
  return errors;
}

describe('remote MCP server', () => {
  it('initializes and negotiates the protocol version', async () => {
    const { status, type, body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
    expect(status).toBe(200);
    expect(type).toContain('application/json');
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.serverInfo.name).toBe('hlplanet-mcp');
    expect(body.result.capabilities.tools).toBeDefined();
    const old = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect(old.body.result.protocolVersion).toBe('2025-06-18');
  });

  it('accepts notifications with 202 and lists seven read-only tools', async () => {
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    const { body } = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect(body.result.tools.map((t: any) => t.name)).toEqual([
      'list_keyboard_sizes', 'compare_keyboards', 'get_keyboard_dimensions', 'check_desk_fit', 'which_sizes_have_key', 'search_hlplanet', 'list_testing_tools'
    ]);
    expect(body.result.tools.every((t: any) => t.annotations.readOnlyHint === true && t.inputSchema.type === 'object')).toBe(true);
  });

  it('answers tool calls like the hlplanet-mcp package', async () => {
    const compare = await call('compare_keyboards', { keyboards: ['TKL', '75%'] });
    expect(compare.body.result.content[0].text).toContain('# TKL (tenkeyless) (80%) vs 75%');
    const key = await call('which_sizes_have_key', { key: 'F12' });
    expect(key.body.result.content[0].text).toContain('- 98% (1800): yes');
    const desk = await call('check_desk_fit', { keyboards: ['60%'], desk_width_cm: 100, mousepad: 'xl' });
    expect(desk.body.result.content[0].text).toContain('# Desk fit: 100 cm desk, XL mousepad (49 x 42 cm)');
    const tools = await call('list_testing_tools');
    expect(tools.body.result.content[0].text).toContain('https://www.hlplanet.com/gamepad-tester/');
  });

  it('reports lookup and argument mistakes as tool errors, unknown tools as protocol errors', async () => {
    const unknownKeyboard = await call('compare_keyboards', { keyboards: ['TKL', 'Banana 9000'] });
    expect(unknownKeyboard.body.result.isError).toBe(true);
    expect(unknownKeyboard.body.result.content[0].text).toContain('Unknown keyboard or size "Banana 9000"');
    const badArgs = await call('check_desk_fit', { keyboards: ['TKL'] });
    expect(badArgs.body.result.isError).toBe(true);
    const unknownTool = await call('delete_everything');
    expect(unknownTool.body.error.code).toBe(-32602);
    const unknownMethod = await rpc({ jsonrpc: '2.0', id: 9, method: 'sampling/createMessage' });
    expect(unknownMethod.body.error.code).toBe(-32601);
  });

  it('searches HLPlanet through the WordPress search API', async () => {
    const fetchMock = vi.fn(async () => Response.json([{ title: 'Wooting 80HE vs 60HE &#8211; review', url: 'https://www.hlplanet.com/wooting-80he-vs-60he/', subtype: 'post' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { body } = await call('search_hlplanet', { query: 'wooting', limit: 3 });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://www.hlplanet.com/wp-json/wp/v2/search?search=wooting&per_page=3&_fields=title,url,subtype');
    expect(body.result.content[0].text).toContain('- Wooting 80HE vs 60HE – review: https://www.hlplanet.com/wooting-80he-vs-60he/');
  });

  it('describes itself with a description and a 512px icon', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
    expect(body.result.serverInfo.description).toContain('keyboard');
    expect(body.result.serverInfo.icons).toEqual([{ src: 'https://api.hlplanet.com/icon.png', mimeType: 'image/png', sizes: ['512x512'] }]);
    const icon = await worker.fetch(new Request('https://api.hlplanet.com/icon.png'));
    expect(icon.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await icon.arrayBuffer()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('returns structuredContent that matches every outputSchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ title: 'Wooting 80HE review', url: 'https://www.hlplanet.com/wooting-80he-review/', subtype: 'post' }])));
    const calls: [string, Record<string, unknown>][] = [
      ['list_keyboard_sizes', {}],
      ['compare_keyboards', { keyboards: ['TKL', 'Wooting 80HE', '60%'], iso: true }],
      ['get_keyboard_dimensions', { query: 'nuphy' }],
      ['get_keyboard_dimensions', { size: '75%' }],
      ['get_keyboard_dimensions', { query: 'TKL' }],
      ['check_desk_fit', { keyboards: ['TKL', '60%'], desk_width_cm: 120, mousepad: 'xl', cm_per_360: 40 }],
      ['check_desk_fit', { keyboards: ['100%'], desk_width_cm: 60, left_handed: true }],
      ['which_sizes_have_key', { key: 'arrow keys' }],
      ['search_hlplanet', { query: 'wooting' }],
      ['list_testing_tools', {}]
    ];
    for (const [name, args] of calls) {
      const { body } = await call(name, args);
      expect(body.result.isError, `${name} ${JSON.stringify(args)}`).toBeUndefined();
      const schema = TOOLS.find((t) => t.name === name)!.outputSchema;
      expect(schema.type).toBe('object');
      expect(validate(schema, body.result.structuredContent), name).toEqual([]);
    }
    const fallback = await call('get_keyboard_dimensions', { query: 'TKL' });
    expect(fallback.body.result.structuredContent.standard_size.id).toBe('tkl');
    const desk = await call('check_desk_fit', { keyboards: ['TKL'], desk_width_cm: 20 });
    expect(desk.body.result.isError).toBe(true);
  });

  it('serves a server card and an AI catalog with caching and CORS', async () => {
    const res = await worker.fetch(new Request('https://api.hlplanet.com/mcp/server-card'));
    expect(res.headers.get('content-type')).toBe('application/mcp-server-card+json');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const card = (await res.json()) as any;
    expect(card.$schema).toBe('https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json');
    expect(card.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(card.description.length).toBeLessThanOrEqual(100);
    expect(card.remotes).toEqual([{ type: 'streamable-http', url: 'https://api.hlplanet.com/mcp', supportedProtocolVersions: expect.any(Array) }]);
    const again = await worker.fetch(new Request('https://api.hlplanet.com/.well-known/mcp/server-card.json', { headers: { 'If-None-Match': res.headers.get('etag')! } }));
    expect(again.status).toBe(304);
    const catalog = (await (await worker.fetch(new Request('https://api.hlplanet.com/.well-known/ai-catalog.json'))).json()) as any;
    expect(catalog.entries[0]).toMatchObject({ type: 'application/mcp-server-card+json', url: 'https://api.hlplanet.com/mcp/server-card' });
  });

  it('shows setup instructions to browsers at the endpoint URL', async () => {
    const page = await worker.fetch(new Request('https://api.hlplanet.com/mcp', { headers: { Accept: 'text/html' } }));
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('claude mcp add --transport http hlplanet');
    const stream = await worker.fetch(new Request('https://api.hlplanet.com/mcp', { headers: { Accept: 'text/event-stream' } }));
    expect(stream.status).toBe(405);
  });

  it('rejects GET streams, batches and invalid JSON', async () => {
    expect((await rpc(null, 'GET')).status).toBe(405);
    expect((await rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }])).status).toBe(400);
    const bad = await rpc('{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe(-32700);
  });
});
