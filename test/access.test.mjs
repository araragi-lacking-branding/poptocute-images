// test/access.test.mjs
// Offline tests for the Cloudflare Access check (src/lib/access.js) and the
// www redirect in src/index.js. JWTs are signed with a throwaway RSA key and the
// Access certs endpoint is mocked, so no network or Cloudflare account is needed.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const TEAM = 'kageki.cloudflareaccess.com';
const AUD = 'test-aud';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const prodUrl = new URL('https://cutetopop.com/admin/images');
const ctx = { waitUntil() {} };

const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };
let good, rogue, verifyAccessRequest, worker;
let certFetches = 0;

before(async () => {
  good = await crypto.subtle.generateKey(rsa, true, ['sign', 'verify']);
  rogue = await crypto.subtle.generateKey(rsa, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', good.publicKey)), kid: 'k1', alg: 'RS256' };

  globalThis.fetch = async (url) => {
    assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`, 'only the Access certs endpoint may be fetched');
    certFetches++;
    return Response.json({ keys: [jwk] });
  };

  ({ verifyAccessRequest } = await import('../src/lib/access.js'));
  worker = (await import('../src/index.js')).default;
});

beforeEach(() => {
  // Denials and the dev bypass log warnings by design; keep test output readable
  console.warn = () => {};
});

const b64u = (data) => Buffer.from(data).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const claims = () => ({ iss: `https://${TEAM}`, aud: [AUD], email: 'admin@example.com', exp: now() + 3600, nbf: now() - 10 });

async function sign(payload, { key = good.privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const h = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
}

const req = (token) => new Request(prodUrl, token ? { headers: { 'Cf-Access-Jwt-Assertion': token } } : {});
const check = (token, e = env) => verifyAccessRequest(req(token), e, prodUrl);

test('allows a valid user token and reports the email', async () => {
  const r = await check(await sign(claims()));
  assert.deepEqual(r, { ok: true, identity: 'admin@example.com' });
});

test('allows aud as a plain string', async () => {
  assert.equal((await check(await sign({ ...claims(), aud: AUD }))).ok, true);
});

test('allows a service token (common_name, no email)', async () => {
  const r = await check(await sign({ ...claims(), email: undefined, common_name: 'svc.access' }));
  assert.deepEqual(r, { ok: true, identity: 'svc.access' });
});

const denied = [
  ['no token', async () => undefined, /missing/],
  ['garbage token', async () => 'not.a.jwt', /./],
  ['two-part token', async () => 'abc.def', /malformed/],
  ['signed by another key', () => sign(claims(), { key: rogue.privateKey }), /bad signature/],
  ['unknown key id', () => sign(claims(), { kid: 'k-other' }), /unknown signing key/],
  ['alg none', async () => (await sign(claims(), { alg: 'none' })).split('.').slice(0, 2).join('.') + '.', /unexpected alg/],
  ['wrong audience', () => sign({ ...claims(), aud: ['someone-else'] }), /wrong audience/],
  ['wrong issuer', () => sign({ ...claims(), iss: 'https://evil.cloudflareaccess.com' }), /wrong issuer/],
  ['expired', () => sign({ ...claims(), exp: now() - 600 }), /expired/],
  ['not yet valid', () => sign({ ...claims(), nbf: now() + 600 }), /not yet valid/],
  ['missing exp', () => sign({ ...claims(), exp: undefined }), /expired/],
  ['tampered payload', async () => {
    const [h, , s] = (await sign(claims())).split('.');
    return `${h}.${b64u(JSON.stringify({ ...claims(), email: 'x@evil' }))}.${s}`;
  }, /bad signature/],
];

for (const [name, makeToken, reason] of denied) {
  test(`denies: ${name}`, async () => {
    const r = await check(await makeToken());
    assert.equal(r.ok, false);
    assert.match(r.reason, reason);
  });
}

test('fails closed when Access config is missing', async () => {
  const r = await check(await sign(claims()), {});
  assert.equal(r.ok, false);
  assert.match(r.reason, /not configured/);
});

test('ACCESS_DEV_BYPASS allows without a token', async () => {
  const r = await check(undefined, { ...env, ACCESS_DEV_BYPASS: 'true' });
  assert.deepEqual(r, { ok: true, identity: 'local-dev' });
});

test('unknown key ids cannot force repeated cert fetches', async () => {
  const before = certFetches;
  for (let i = 0; i < 5; i++) await check(await sign(claims(), { kid: `k-${i}` }));
  assert.ok(certFetches - before <= 1, `expected at most 1 refetch, saw ${certFetches - before}`);
});

test('worker returns 403 on admin paths without a token', async () => {
  for (const path of ['/admin', '/admin/images', '/api/admin/sync']) {
    const r = await worker.fetch(new Request(`https://cutetopop.com${path}`), env, ctx);
    assert.equal(r.status, 403, path);
  }
});

test('www redirects to the bare domain, keeping path and query', async () => {
  for (const [from, to] of [
    ['https://www.cutetopop.com/', 'https://cutetopop.com/'],
    ['https://www.cutetopop.com/admin/images?x=1', 'https://cutetopop.com/admin/images?x=1'],
    ['https://www.cutetopop.com/images/abc.jpg', 'https://cutetopop.com/images/abc.jpg'],
  ]) {
    const r = await worker.fetch(new Request(from), {}, ctx);
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.get('Location'), to);
  }
});
