// Sign-in against the container's cookie sessions (deploy/njs/auth.js). The cookie is
// HttpOnly, so the page only ever learns the user name and which profiles it may open.
const BASE = `${import.meta.env.BASE_URL}api/`;

/** thrown by API helpers when the session is missing or expired */
export class AuthError extends Error {
  constructor() {
    super('unauthenticated');
  }
}

/** a signed-in login; each profile is a separate upload library (deploy/njs/auth.js) */
export interface Session {
  user: string;
  profiles: string[];
}

export async function getSession(): Promise<Session | null> {
  const res = await fetch(BASE + 'session', { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`session: HTTP ${res.status}`);
  return (await res.json()) as Session;
}

export type LoginResult = { ok: true; session: Session } | { ok: false; reason: 'invalid' | 'limited' | 'error' };

export async function login(user: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch(BASE + 'login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password }),
    });
    if (res.ok) return { ok: true, session: (await res.json()) as Session };
    return { ok: false, reason: res.status === 401 ? 'invalid' : res.status === 429 ? 'limited' : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function logout(): Promise<void> {
  await fetch(BASE + 'logout', { method: 'POST' }).catch(() => undefined);
}
