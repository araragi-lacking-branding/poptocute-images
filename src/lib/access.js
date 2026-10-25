// src/lib/access.js
// Cloudflare Access verification for admin requests.
//
// Access at the edge is the primary gate for /admin and /api/admin/*, but it only
// covers the hostnames its application lists. This check runs inside the Worker so
// admin stays closed even if a route, hostname, or Access rule is misconfigured.
// See https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

const CERTS_TTL_MS = 60 * 60 * 1000; // Re-fetch signing keys hourly (Access rotates them)
const CERTS_MIN_REFRESH_MS = 60 * 1000; // Unknown key ids can't force a re-fetch more often than this
const CLOCK_SKEW_S = 60;

let certsCache = { teamDomain: null, keys: [], fetchedAt: 0 };

/**
 * Verify the Cf-Access-Jwt-Assertion header on a request.
 * Fails closed: missing config, missing token, or any check failure denies access.
 * @returns {Promise<{ok: true, identity: string} | {ok: false, reason: string}>}
 */
export async function verifyAccessRequest(request, env, url) {
  // Local development only: wrangler dev has no Access in front of it.
  // ACCESS_DEV_BYPASS belongs in .dev.vars (gitignored, never uploaded). It can't be
  // tied to localhost because wrangler dev rewrites request URLs to the first route's
  // host. Never set it in wrangler.toml; wrangler deploy replaces dashboard vars.
  if (env.ACCESS_DEV_BYPASS === 'true') {
    console.warn(`[ACCESS BYPASS] ${url.pathname} | ACCESS_DEV_BYPASS is set`);
    return { ok: true, identity: 'local-dev' };
  }

  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  if (!teamDomain || !audience) {
    return { ok: false, reason: 'ACCESS_TEAM_DOMAIN or ACCESS_AUD not configured' };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return { ok: false, reason: 'missing Cf-Access-Jwt-Assertion header' };
  }

  try {
    const payload = await verifyJwt(token, teamDomain);
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    if (payload.iss !== `https://${teamDomain}`) {
      return { ok: false, reason: 'wrong issuer' };
    }
    if (!audiences.includes(audience)) {
      return { ok: false, reason: 'wrong audience' };
    }
    if (typeof payload.exp !== 'number' || payload.exp < now - CLOCK_SKEW_S) {
      return { ok: false, reason: 'token expired' };
    }
    if (typeof payload.nbf === 'number' && payload.nbf > now + CLOCK_SKEW_S) {
      return { ok: false, reason: 'token not yet valid' };
    }

    // Users carry an email; service tokens carry a common_name instead
    return { ok: true, identity: payload.email || payload.common_name || 'unknown' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

// Check an RS256 JWT signature against the team's published signing keys
async function verifyJwt(token, teamDomain) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('malformed token');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecodeText(headerB64));
  if (header.alg !== 'RS256') {
    throw new Error(`unexpected alg ${header.alg}`);
  }

  let jwk = (await getSigningKeys(teamDomain, false)).find(key => key.kid === header.kid);
  if (!jwk) {
    // Unknown key id: keys may have rotated since the last fetch
    jwk = (await getSigningKeys(teamDomain, true)).find(key => key.kid === header.kid);
  }
  if (!jwk) {
    throw new Error('unknown signing key');
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecodeBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) {
    throw new Error('bad signature');
  }

  return JSON.parse(base64UrlDecodeText(payloadB64));
}

async function getSigningKeys(teamDomain, forceRefresh) {
  const sameTeam = certsCache.teamDomain === teamDomain;
  const age = Date.now() - certsCache.fetchedAt;
  if (sameTeam && age < (forceRefresh ? CERTS_MIN_REFRESH_MS : CERTS_TTL_MS)) {
    return certsCache.keys;
  }

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error(`could not fetch Access certs (HTTP ${response.status})`);
  }
  const { keys } = await response.json();
  certsCache = { teamDomain, keys: keys || [], fetchedAt: Date.now() };
  return certsCache.keys;
}

function base64UrlDecodeBytes(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function base64UrlDecodeText(input) {
  return new TextDecoder().decode(base64UrlDecodeBytes(input));
}
