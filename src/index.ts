// HLPlanet Keyboard API: Cloudflare Worker for api.hlplanet.com.
import { ApiError, compare, deskFitJson, getKeyboard, getSize, keyAvailability, listKeyboards, listSizes, tools } from './api.js';
import { PAGES, llmsTxt, markdownPath, openApi, pageHtml, pageMarkdown } from './docs.js';
import { ICON_PNG_BASE64 } from './icon.js';
import { aiCatalog, handleMcp, serverCard } from './mcp.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
};
// The data only changes with a deploy, so let browsers and the edge cache for an hour
const CACHE = 'public, max-age=3600';

function respond(body: string, type: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': type, 'Cache-Control': status === 200 ? CACHE : 'no-store', ...CORS, ...extra } });
}

function jsonResponse(data: unknown, status = 200): Response {
  return respond(JSON.stringify(data, null, 2) + '\n', 'application/json; charset=utf-8', status);
}

const ICON = Uint8Array.from(atob(ICON_PNG_BASE64), (c) => c.charCodeAt(0));

// Server card and AI catalog, with the CORS, caching and ETag rules of the MCP server card extension
const CARD_PATHS = ['/mcp/server-card', '/.well-known/mcp/server-card.json', '/.well-known/mcp-server-card'];

function etag(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) h = Math.imul(h ^ body.charCodeAt(i), 0x01000193);
  return `"${(h >>> 0).toString(16)}"`;
}

function discoveryResponse(request: Request, data: unknown, type: string): Response {
  const body = JSON.stringify(data, null, 2) + '\n';
  const tag = etag(body);
  const headers = {
    'Content-Type': type,
    'Cache-Control': CACHE,
    ETag: tag,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag'
  };
  if (request.headers.get('If-None-Match') === tag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}

function apiRoute(path: string, params: URLSearchParams): unknown {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent); // ['v1', 'sizes', '75']
  const [, resource, id, ...rest] = parts;
  if (rest.length) throw new ApiError(404, 'not_found', `No endpoint at ${path}.`);
  switch (resource) {
    case 'sizes':
      return id ? getSize(id) : listSizes();
    case 'keyboards':
      return id ? getKeyboard(id) : listKeyboards(params);
    case 'compare':
      if (!id) return compare(params);
      break;
    case 'desk-fit':
      if (!id) return deskFitJson(params);
      break;
    case 'keys':
      if (id) return keyAvailability(id, params);
      throw new ApiError(400, 'missing_parameter', 'Add a key to the path, e.g. /v1/keys/delete.');
    case 'tools':
      if (!id) return tools();
      break;
    case undefined:
      return { name: 'HLPlanet Keyboard API', version: '1.0.0', docs: 'https://api.hlplanet.com/', openapi: 'https://api.hlplanet.com/openapi.json' };
  }
  throw new ApiError(404, 'not_found', `No endpoint at ${path}. See https://api.hlplanet.com/ for the list.`);
}

export function handle(request: Request): Response {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: { code: 'method_not_allowed', message: 'Only GET, HEAD and OPTIONS are supported.' } }, 405);
  }

  // Trailing slashes redirect to the canonical path (except the root)
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    return Response.redirect(url.origin + url.pathname.replace(/\/+$/, '') + url.search, 301);
  }
  const path = url.pathname;

  if (path === '/v1' || path.startsWith('/v1/')) {
    try {
      return jsonResponse(apiRoute(path, url.searchParams));
    } catch (e) {
      if (e instanceof ApiError) return jsonResponse({ error: { code: e.code, message: e.message } }, e.status);
      return jsonResponse({ error: { code: 'internal_error', message: 'Something went wrong.' } }, 500);
    }
  }

  if (CARD_PATHS.includes(path)) return discoveryResponse(request, serverCard(), 'application/mcp-server-card+json');
  if (path === '/.well-known/ai-catalog.json') return discoveryResponse(request, aiCatalog(), 'application/ai-catalog+json');
  if (path === '/icon.png') return new Response(ICON, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', ...CORS } });

  if (path === '/llms.txt') return respond(llmsTxt(), 'text/plain; charset=utf-8');
  if (path === '/openapi.json') return jsonResponse(openApi());
  if (path === '/robots.txt') return respond(`User-agent: *\nAllow: /\nSitemap: https://api.hlplanet.com/sitemap.xml\n`, 'text/plain; charset=utf-8');
  if (path === '/sitemap.xml') {
    const urls = PAGES.map((p) => `<url><loc>https://api.hlplanet.com${p.path}</loc></url>`).join('');
    return respond(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, 'application/xml; charset=utf-8');
  }

  const mdPage = PAGES.find((p) => markdownPath(p) === path);
  if (mdPage) return respond(pageMarkdown(mdPage), 'text/markdown; charset=utf-8');

  const page = PAGES.find((p) => p.path === path);
  if (page) {
    const wantsMarkdown = /\btext\/markdown\b/.test(request.headers.get('Accept') ?? '');
    return wantsMarkdown
      ? respond(pageMarkdown(page), 'text/markdown; charset=utf-8', 200, { Vary: 'Accept' })
      : respond(pageHtml(page), 'text/html; charset=utf-8', 200, { Vary: 'Accept', Link: '<https://api.hlplanet.com/llms.txt>; rel="llms-txt"' });
  }

  return respond('Not found. Documentation: https://api.hlplanet.com/\n', 'text/plain; charset=utf-8', 404);
}

export default {
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') {
      // A browser or crawler opening the endpoint gets the setup page; MCP clients asking for an SSE stream still get 405
      const accept = request.headers.get('Accept') ?? '';
      if ((request.method === 'GET' || request.method === 'HEAD') && !accept.includes('text/event-stream')) {
        return handle(new Request(url.origin + '/docs/mcp', { method: request.method, headers: request.headers }));
      }
      return handleMcp(request);
    }
    return handle(request);
  }
};
