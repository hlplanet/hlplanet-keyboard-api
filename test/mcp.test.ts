import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

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

  it('rejects GET streams, batches and invalid JSON', async () => {
    expect((await rpc(null, 'GET')).status).toBe(405);
    expect((await rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }])).status).toBe(400);
    const bad = await rpc('{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe(-32700);
  });
});
