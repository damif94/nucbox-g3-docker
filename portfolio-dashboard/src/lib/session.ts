// Sign-in against the container's cookie sessions (deploy/njs/auth.js). The cookie is
// HttpOnly, so the page only ever learns the user name.
const BASE = `${import.meta.env.BASE_URL}api/`;

/** thrown by API helpers when the session is missing or expired */
export class AuthError extends Error {
  constructor() {
    super('unauthenticated');
  }
}

export async function getSession(): Promise<string | null> {
  const res = await fetch(BASE + 'session', { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`session: HTTP ${res.status}`);
  return ((await res.json()) as { user: string }).user;
}

export type LoginResult = { ok: true; user: string } | { ok: false; reason: 'invalid' | 'limited' | 'error' };

export async function login(user: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch(BASE + 'login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password }),
    });
    if (res.ok) return { ok: true, user: ((await res.json()) as { user: string }).user };
    return { ok: false, reason: res.status === 401 ? 'invalid' : res.status === 429 ? 'limited' : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function logout(): Promise<void> {
  await fetch(BASE + 'logout', { method: 'POST' }).catch(() => undefined);
}
