/**
 * Cloudflare Worker: Open Graph preview for Co-op links + short URLs (KV).
 * POST /api/shorten { g, r, sport } -> { url } short link for chat apps.
 * GET /p/:id -> OG HTML + redirect to r (g, sport from KV).
 * Legacy GET ?g=&r=&sport= still supported (long URLs; may break in iMessage).
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAllowedRedirect(r) {
  try {
    const u = new URL(r);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname;
    if (host === 'picksix.lol' || host === 'www.picksix.lol') return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.github.io')) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/** Same OG image assets as /share/<sport>/ — must match picksix.lol static files. */
const OG_BY_SPORT = {
  nfl: { image: 'https://picksix.lol/og-image-nfl.png', label: 'NFL' },
  nba: { image: 'https://picksix.lol/og-image-nba.png', label: 'NBA' },
  mlb: { image: 'https://picksix.lol/og-image-mlb.png', label: 'MLB' },
  nhl: { image: 'https://picksix.lol/og-image-nhl.png', label: 'NHL' },
  epl: { image: 'https://picksix.lol/og-image-epl.png', label: 'EPL' },
  golf: { image: 'https://picksix.lol/og-image-golf.png', label: 'Golf' },
  all: { image: 'https://picksix.lol/og-image-all.png', label: 'All sports' },
};

const OG_DEFAULT = {
  image: 'https://picksix.lol/og-image.png',
  label: 'Sports',
};

function ogMetaForSport(sportRaw) {
  const key = String(sportRaw || '').toLowerCase().trim();
  const og = OG_BY_SPORT[key] || OG_DEFAULT;
  return {
    image: og.image,
    imageAlt: `Pick Six — ${og.label} — branded preview card`,
    label: og.label,
  };
}

function corsHeaders(requestOrigin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  const o = requestOrigin || '';
  if (
    o === 'https://picksix.lol'
    || o === 'https://www.picksix.lol'
    || o.startsWith('http://localhost:')
    || o.startsWith('http://127.0.0.1:')
  ) {
    h['Access-Control-Allow-Origin'] = o;
  } else {
    h['Access-Control-Allow-Origin'] = 'https://picksix.lol';
  }
  return h;
}

function buildPreviewHtml(pageUrl, g, r, sportParam) {
  const { image: ogImage, imageAlt: ogImageAlt, label: sportLabel } = ogMetaForSport(sportParam);
  const title = `Pick Six — ${sportLabel} — ${g}`;
  const desc = `Co-op — ${sportLabel}. Your turn to guess.`;
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(desc);
  const safeUrl = escapeHtml(pageUrl.toString());
  const safeOgImage = escapeHtml(ogImage);
  const safeOgImageAlt = escapeHtml(ogImageAlt);
  const noRedirect = pageUrl.searchParams.get('noredirect') === '1';
  const redirectScript = noRedirect
    ? ''
    : `<script>location.replace(${JSON.stringify(r)});</script>`;
  const debugNote = noRedirect
    ? '<p style="color:#888;font-size:14px">Preview only (<code>noredirect=1</code>) — chat apps use the meta tags above without this redirect.</p>'
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:url" content="${safeUrl}">
<meta property="og:image" content="${safeOgImage}">
<meta property="og:image:alt" content="${safeOgImageAlt}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="${safeOgImage}">
</head>
<body>
${debugNote}
<p><a href="${escapeHtml(r)}">Continue to Pick Six</a></p>
${redirectScript}
</body>
</html>`;
}

async function handleShorten(request, env, url) {
  if (!env.COOP_KV) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json', ...corsHeaders(request.headers.get('Origin')) },
    });
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json', ...corsHeaders(request.headers.get('Origin')) },
    });
  }
  const { g, r, sport } = body;
  if (!r || typeof r !== 'string' || !isAllowedRedirect(r)) {
    return new Response(JSON.stringify({ error: 'Bad redirect' }), {
      status: 400,
      headers: { 'content-type': 'application/json', ...corsHeaders(request.headers.get('Origin')) },
    });
  }
  const gStr = String(g || 'Your turn').slice(0, 200);
  const sportStr = String(sport || '').slice(0, 24);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const payload = JSON.stringify({ g: gStr, r, sport: sportStr });
  await env.COOP_KV.put(id, payload, { expirationTtl: 1209600 });
  const shortUrl = `${url.origin}/p/${id}`;
  return new Response(JSON.stringify({ url: shortUrl }), {
    headers: {
      'content-type': 'application/json',
      ...corsHeaders(request.headers.get('Origin')),
    },
  });
}

async function handlePreview(id, url, env) {
  if (!env.COOP_KV) {
    return Response.redirect('https://picksix.lol/', 302);
  }
  const raw = await env.COOP_KV.get(id);
  if (!raw) {
    return new Response('Not found', { status: 404 });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return new Response('Not found', { status: 404 });
  }
  const { g, r, sport } = data;
  if (!r || typeof r !== 'string' || !isAllowedRedirect(r)) {
    return Response.redirect('https://picksix.lol/', 302);
  }
  const html = buildPreviewHtml(url, g, r, sport);
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, max-age=60' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/api/shorten') {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
    }
    if (request.method === 'POST' && url.pathname === '/api/shorten') {
      return handleShorten(request, env, url);
    }

    const match = url.pathname.match(/^\/p\/([a-zA-Z0-9]+)$/);
    if (match) {
      return handlePreview(match[1], url, env);
    }

    const g = url.searchParams.get('g') || 'Your turn';
    const r = url.searchParams.get('r');
    if (!r || !isAllowedRedirect(r)) {
      return Response.redirect('https://picksix.lol/', 302);
    }
    const sportParam = url.searchParams.get('sport');
    const html = buildPreviewHtml(url, g, r, sportParam);
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, max-age=60' },
    });
  },
};
