import { useSettings } from '../settings';
import { Term } from './Term';
import type { Dataset } from '../lib/types';

export function Header({ ds, onReset }: { ds?: Dataset; onReset?: () => void }) {
  const { t, fmt, lang, setLang, theme, setTheme } = useSettings();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark" aria-hidden="true" />
        <span className="name">{t.appName}</span>
        {ds && (
          <span className="meta">
            <Term k="cif">{t.client}</Term> <b className="mono">{ds.cif}</b>
            <span className="sep">·</span>
            {t.asOf} <b>{fmt.date(ds.asOf, 'long')}</b>
          </span>
        )}
      </div>
      <div className="controls">
        {onReset && (
          <button className="btn ghost" onClick={onReset}>
            {t.loadOther}
          </button>
        )}
        <div className="seg" role="group" aria-label={t.lang}>
          {(['es', 'en'] as const).map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="btn icon" aria-label={t.theme.toggle} title={theme === 'dark' ? t.theme.light : t.theme.dark} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          )}
        </button>
      </div>
    </header>
  );
}
