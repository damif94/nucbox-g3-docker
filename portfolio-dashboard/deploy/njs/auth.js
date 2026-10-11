// Cookie sessions for the dashboard, run inside nginx (njs) so there is no app server.
// Logins come from the users file written at startup by deploy/10-users.sh; the HMAC key
// lives on the data volume (deploy/15-data-dir.sh), so sessions survive restarts.
// A session is "<base64url user>.<expiry>.<hmac>"; dropping a user from .env revokes it.
import fs from 'fs';
import crypto from 'crypto';

const USERS_FILE = '/etc/nginx/conf.d/users';
const SECRET_FILE = '/data/.session-secret';
const COOKIE = 'pd_session';
// the browser-facing path: NPM serves the app under /portfolio/ and strips the prefix
const COOKIE_PATH = '/portfolio/';
const TTL = 30 * 24 * 3600;

function secret() {
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

function users() {
  const map = {};
  // njs (the version in this nginx image) has no for...of or destructuring
  fs.readFileSync(USERS_FILE, 'utf8').split('\n').forEach(function (line) {
    const i = line.indexOf(':');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  });
  return map;
}

const mac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('base64url');

// compares MACs of both values, so the early exit of === reveals nothing about the inputs
const same = (key, a, b) => mac(key, 'cmp|' + a) === mac(key, 'cmp|' + b);

function sessionUser(r) {
  const raw = r.variables.cookie_pd_session;
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const u64 = parts[0];
  const exp = parts[1];
  const sig = parts[2];
  if (!(Number(exp) > Date.now() / 1000)) return null;
  const key = secret();
  if (!same(key, sig, mac(key, u64 + '.' + exp))) return null;
  const user = Buffer.from(u64, 'base64url').toString();
  return Object.prototype.hasOwnProperty.call(users(), user) ? user : null;
}

const cookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

function json(r, status, body) {
  r.headersOut['Content-Type'] = 'application/json';
  r.headersOut['Cache-Control'] = 'no-store';
  r.return(status, JSON.stringify(body));
}

// auth_request target for the protected locations
function check(r) {
  r.return(sessionUser(r) ? 204 : 401);
}

function session(r) {
  const user = sessionUser(r);
  if (user) json(r, 200, { user });
  else json(r, 401, { error: 'unauthenticated' });
}

function login(r) {
  let body;
  try {
    body = JSON.parse(r.requestText || '');
  } catch (e) {
    return json(r, 400, { error: 'bad request' });
  }
  const user = String(body.user || '').trim();
  const password = String(body.password || '');
  const all = users();
  const key = secret();
  const known = Object.prototype.hasOwnProperty.call(all, user);
  // compare even for unknown users so the timing doesn't tell which names exist
  const ok = same(key, password, known ? all[user] : '\u0000no-user') && known && user !== '';
  if (!ok) return json(r, 401, { error: 'invalid credentials' });
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const u64 = Buffer.from(user).toString('base64url');
  r.headersOut['Set-Cookie'] = cookie(`${u64}.${exp}.${mac(key, u64 + '.' + exp)}`, TTL);
  json(r, 200, { user });
}

function logout(r) {
  r.headersOut['Set-Cookie'] = cookie('', 0);
  r.return(204);
}

export default { check, session, login, logout };
