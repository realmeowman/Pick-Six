/**
 * Cloudflare Worker: deploy and set COOP_PREVIEW_ORIGIN in game.js to this Worker URL.
 * Serves a tiny HTML page with og:title including the guess (g) and redirects to the game (r).
 * Query: g, r (redirect URL), sport (nfl|nba|…|golf). Append &noredirect=1 to skip auto-redirect (browser testing).
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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const g = url.searchParams.get('g') || 'Your turn';
    const r = url.searchParams.get('r');
    if (!r || !isAllowedRedirect(r)) {
      return Response.redirect('https://picksix.lol/', 302);
    }
    const sportParam = url.searchParams.get('sport');
    const { image: ogImage, imageAlt: ogImageAlt, label: sportLabel } = ogMetaForSport(sportParam);
    const title = `Pick Six — ${sportLabel} — ${g}`;
    const desc = `Co-op — ${sportLabel}. Your turn to guess.`;
    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(desc);
    const safeUrl = escapeHtml(url.toString());
    const safeOgImage = escapeHtml(ogImage);
    const safeOgImageAlt = escapeHtml(ogImageAlt);
    const noRedirect = url.searchParams.get('noredirect') === '1';
    const redirectScript = noRedirect
      ? ''
      : `<script>location.replace(${JSON.stringify(r)});</script>`;
    const debugNote = noRedirect
      ? '<p style="color:#888;font-size:14px">Preview only (<code>noredirect=1</code>) — chat apps use the meta tags above without this redirect.</p>'
      : '';
    const html = `<!DOCTYPE html>
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
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, max-age=60' },
    });
  },
};
