/**
 * Cloudflare Worker: deploy and set COOP_PREVIEW_ORIGIN in game.js to this Worker URL.
 * Serves a tiny HTML page with og:title including the guess (g) and redirects to the game (r).
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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const g = url.searchParams.get('g') || 'Your turn';
    const r = url.searchParams.get('r');
    if (!r || !isAllowedRedirect(r)) {
      return Response.redirect('https://picksix.lol/', 302);
    }
    const title = `Pick Six — ${g}`;
    const desc = 'Your turn to guess.';
    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(desc);
    const safeUrl = escapeHtml(url.toString());
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:url" content="${safeUrl}">
<meta property="og:image" content="https://picksix.lol/og-image.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<p><a href="${escapeHtml(r)}">Continue to Pick Six</a></p>
<script>location.replace(${JSON.stringify(r)});</script>
</body>
</html>`;
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, max-age=60' },
    });
  },
};
