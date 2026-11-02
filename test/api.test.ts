import { describe, expect, it } from 'vitest';
import { handle } from '../src/index.js';
import { PAGES, markdownPath } from '../src/docs.js';

const get = (path: string, headers: Record<string, string> = {}) => handle(new Request('https://api.hlplanet.com' + path, { headers }));
const json = async (path: string) => {
  const res = get(path);
  return { status: res.status, body: (await res.json()) as any, res };
};

describe('API', () => {
  it('lists the six sizes with dimensions and missing keys', async () => {
    const { status, body, res } = await json('/v1/sizes');
    expect(status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(body.sizes.map((s: any) => s.id)).toEqual(['full', '1800', 'tkl', '75', '65', '60']);
    expect(body.sizes.map((s: any) => s.keys)).toEqual([104, 99, 87, 84, 68, 61]);
    expect(body.sizes[1].name).toBe('98% (1800)');
    const sixty = body.sizes[5];
    expect(sixty.missing_vs_full_size.summary).toContain('Arrow keys');
  });

  it('gets a size by id or alias, and 404s an unknown one', async () => {
    expect((await json('/v1/sizes/tkl')).body.id).toBe('tkl');
    expect((await json('/v1/sizes/tenkeyless')).body.id).toBe('tkl');
    const missing = await json('/v1/sizes/42');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('unknown_size');
  });

  it('filters measured keyboards and returns review links', async () => {
    const all = await json('/v1/keyboards');
    expect(all.body.count).toBe(30);
    const sixties = await json('/v1/keyboards?size=60');
    expect(sixties.body.keyboards.every((k: any) => k.size === '60%')).toBe(true);
    const wooting = await json('/v1/keyboards?q=wooting');
    expect(wooting.body.keyboards.map((k: any) => k.id)).toEqual(['wooting-80he', 'wooting-60he-v2', 'wooting-60he-plus']);
    const one = await json('/v1/keyboards/wooting-80he');
    expect(one.body).toMatchObject({ width_mm: 346, depth_mm: 142, review_url: 'https://www.hlplanet.com/wooting-80he-vs-60he/' });
  });

  it('compares a TKL with a 75%', async () => {
    const { body } = await json('/v1/compare?items=tkl,75');
    expect(body.reference.id).toBe('tkl');
    expect(body.items[0].id).toBe('75');
    expect(body.items[0].width_diff_mm).toBeLessThan(0);
    expect(body.items[0].missing_keys.count).toBeGreaterThan(0);
    expect(body.compare_url).toBe('https://www.hlplanet.com/keyboard-layout/?compare=tkl,75,ref-tkl');
  });

  it('rejects bad compare input with a stable error code', async () => {
    const one = await json('/v1/compare?items=tkl');
    expect(one.status).toBe(400);
    expect(one.body.error.code).toBe('invalid_parameter');
    const unknown = await json('/v1/compare?items=tkl,banana');
    expect(unknown.body.error.code).toBe('unknown_keyboard');
  });

  it('checks desk fit, including a 360 turn and a custom pad', async () => {
    const { body } = await json('/v1/desk-fit?keyboard=tkl&desk_width_cm=120&mousepad=large&cm_per_360=40');
    expect(body.mousepad.width_cm).toBe(45);
    expect(typeof body.mouse_room_cm).toBe('number');
    expect(body.turn_360).toMatchObject({ cm_per_360: 40 });
    const custom = await json('/v1/desk-fit?keyboard=60&desk_width_cm=100&mousepad=custom');
    expect(custom.status).toBe(400);
    expect(custom.body.error.code).toBe('missing_parameter');
    const narrow = await json('/v1/desk-fit?keyboard=full&desk_width_cm=60&mousepad=xl');
    expect(narrow.body.pad_fits).toBe(false);
  });

  it('finds which sizes have F5 and the numpad', async () => {
    const f5 = await json('/v1/keys/f5');
    const by = Object.fromEntries(f5.body.sizes.map((s: any) => [s.id, s.has]));
    expect(by).toMatchObject({ full: 'yes', '75': 'yes', '65': 'no', '60': 'no' });
    expect((await json('/v1/keys/page-up')).body.key).toBe('Page Up');
    expect((await json('/v1/keys/numpad')).body.sizes.find((s: any) => s.id === '1800').has).toBe('yes');
    expect((await json('/v1/keys/warp-drive')).status).toBe(404);
  });

  it('handles unknown endpoints, methods and CORS preflight', async () => {
    expect((await json('/v1/nope')).body.error.code).toBe('not_found');
    const post = handle(new Request('https://api.hlplanet.com/v1/sizes', { method: 'POST' }));
    expect(post.status).toBe(405);
    const pre = handle(new Request('https://api.hlplanet.com/v1/sizes', { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
  });
});

describe('Docs for agents', () => {
  it('serves every page as HTML with a hidden pointer to llms.txt, and as Markdown', async () => {
    for (const page of PAGES) {
      const html = get(page.path);
      expect(html.headers.get('content-type')).toContain('text/html');
      const text = await html.text();
      expect(text).toContain('class="sr-only">For AI agents');
      expect(text).toContain('https://api.hlplanet.com/llms.txt');
      expect(text).not.toMatch(/<pre><code[^>]*>[^<]*```/); // fences are converted, not leaked

      const md = get(markdownPath(page));
      expect(md.headers.get('content-type')).toContain('text/markdown');
      const mdText = await md.text();
      expect(mdText.startsWith('> Documentation index: https://api.hlplanet.com/llms.txt')).toBe(true);
      expect((mdText.match(/```/g) ?? []).length % 2).toBe(0); // every fence is closed

      const negotiated = get(page.path, { Accept: 'text/markdown' });
      expect(negotiated.headers.get('content-type')).toContain('text/markdown');
    }
  });

  it('llms.txt links every Markdown page with absolute URLs that resolve', async () => {
    const text = await get('/llms.txt').text();
    expect(text.startsWith('# HLPlanet Keyboard API')).toBe(true);
    const links = [...text.matchAll(/\]\((https:\/\/api\.hlplanet\.com[^)]+)\)/g)].map((m) => m[1]);
    for (const page of PAGES) expect(links).toContain('https://api.hlplanet.com' + markdownPath(page));
    for (const link of links) expect(get(new URL(link).pathname).status).toBe(200);
  });

  it('publishes an OpenAPI 3.0 document covering every endpoint', async () => {
    const { body } = await json('/openapi.json');
    expect(body.openapi).toBe('3.0.3');
    expect(Object.keys(body.paths)).toEqual(['/sizes', '/sizes/{id}', '/keyboards', '/keyboards/{id}', '/compare', '/desk-fit', '/keys/{key}', '/tools']);
  });

  it('redirects trailing slashes to the canonical URL', () => {
    const res = get('/docs/compare/');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://api.hlplanet.com/docs/compare');
  });
});
