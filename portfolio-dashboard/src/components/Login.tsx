import { useState, type FormEvent } from 'react';
import { useSettings } from '../settings';
import { login } from '../lib/session';
import { Logo } from './Logo';

export function Login({ onSignedIn }: { onSignedIn: (user: string) => void }) {
  const { t } = useSettings();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await login(user, password);
    setBusy(false);
    if (res.ok) return onSignedIn(res.user);
    setPassword('');
    setError(res.reason === 'invalid' ? t.loginInvalid : res.reason === 'limited' ? t.loginLimited : t.loginError);
  }

  return (
    <main className="login">
      <div className="login-copy">
        <Logo size={56} className="hero" />
        <p className="eyebrow">{t.appName}</p>
        <h1>{t.loginTitle}</h1>
        <p className="lead">{t.loginLead}</p>
      </div>
      {/* a real form with autocomplete hints, so password managers fill and save it */}
      <form className="login-card" onSubmit={submit} noValidate>
        <label className="field">
          <span>{t.loginUser}</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t.loginPassword}</span>
          <span className="pw">
            <input
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="pw-toggle" aria-pressed={show} onClick={() => setShow(!show)}>
              {show ? t.loginHide : t.loginShow}
            </button>
          </span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary block" type="submit" disabled={busy || !user || !password}>
          {busy ? t.loginBusy : t.loginSubmit}
        </button>
        <p className="fine">{t.loginFine}</p>
      </form>
    </main>
  );
}
