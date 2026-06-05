// Resolve a Google Maps share link (maps.app.goo.gl / goo.gl) to its expanded
// long URL, which carries the place name and coordinates the client can parse.
// Lives in Supabase Edge Functions because the redirect cannot be followed in
// the browser (CORS) and the project has no other server.
//
// Request:  POST { "url": "https://maps.app.goo.gl/abc123" }
// Response: 200  { "expandedUrl": "https://www.google.com/maps/place/..." }
// Errors:   400 invalid input or disallowed host
//           502 upstream fetch failed
//
// Auth: standard Supabase anon-key check (verify_jwt default on). The anon key
// is already in the Lark frontend, so the function is effectively callable by
// anyone running Lark, but not by random internet traffic.

// deno-lint-ignore-file no-explicit-any
declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void };

const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'maps.google.com',
  'www.google.com',
  'google.com',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const input = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!input) return json({ error: 'url required' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return json({ error: 'invalid url' }, 400);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return json({ error: 'unsupported protocol' }, 400);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return json({ error: 'host not allowed' }, 400);
  }

  // Follow redirects (Deno's fetch chases up to 20 by default).
  // IMPORTANT: do NOT send a desktop-browser User-Agent here. For Chrome-class
  // UAs, maps.app.goo.gl serves a 200 HTML interstitial that does the redirect
  // in JavaScript — fetch can't see the destination. Bot/link-preview style
  // UAs get a real HTTP 30x to the long www.google.com/maps URL, which is what
  // we need to parse coordinates and the place name.
  try {
    const res = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; LarkLinkResolver/1.0; +https://wandermind-wine.vercel.app)',
      },
    });
    // We don't need the body — discard it to free the connection.
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return json({ expandedUrl: res.url });
  } catch (err) {
    return json({ error: 'upstream fetch failed', detail: String(err) }, 502);
  }
});
