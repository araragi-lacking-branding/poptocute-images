// src/lib/request-guards.js
// Cross-site request checks for admin routes, applied in src/index.js after the
// Access check.
//
// Why: Access logs the admin in with a cookie (CF_Authorization), and the
// browser attaches it to requests that other websites trigger, e.g. a hidden
// <form method="POST"> on a hostile page (CSRF). Every browser sends an Origin
// header on cross-site POST/PUT/PATCH/DELETE, so a write is only accepted when
// it comes from this site's own pages.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// wrangler dev serves the admin pages from localhost; only trusted with the dev bypass
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isCrossSiteWrite(request, env, url) {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get('Origin');
  if (origin) {
    if (origin === url.origin) return false;
    if (env.ACCESS_DEV_BYPASS === 'true' && DEV_ORIGIN.test(origin)) return false;
    return true; // includes Origin: null (sandboxed frames, privacy redirects)
  }
  // No Origin: a non-browser client (curl, a service token). If a browser did
  // send this, Sec-Fetch-Site still tells us where it came from.
  const site = request.headers.get('Sec-Fetch-Site');
  return site === 'cross-site' || site === 'same-site';
}

// Admin pages must never be framed (clickjacking) or content-sniffed
export function withAdminHeaders(response) {
  const out = new Response(response.body, response);
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'same-origin');
  const csp = out.headers.get('Content-Security-Policy');
  if (!csp) out.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  else if (!/frame-ancestors/.test(csp)) out.headers.set('Content-Security-Policy', `${csp}; frame-ancestors 'none'`);
  return out;
}
