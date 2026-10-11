import type { ReactNode } from 'react';
import { useSettings } from '../settings';
import type { Holding } from '../lib/types';
import { displayName } from '../lib/analytics';

export function Panel({ title, aside, children, className = '', id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`panel ${className}`} id={id}>
      <header className="panel-head">
        <h2>{title}</h2>
        {aside && <div className="panel-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** Signed value with an arrow so gain/loss never relies on color alone. */
export function Delta({ value, children }: { value: number; children: ReactNode }) {
  const dir = value > 0.005 ? 'up' : value < -0.005 ? 'down' : 'flat';
  return (
    <span className={`delta ${dir}`}>
      <span aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}</span>
      {children}
    </span>
  );
}

export function useHoldingName() {
  const { t } = useSettings();
  return (h: Holding) => (h.bucket === 'cash' || h.bucket === 'credit' ? t.cashNames[h.assetClass] ?? h.description : displayName(h));
}
