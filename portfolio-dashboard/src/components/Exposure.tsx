import { useState } from 'react';
import { useSettings } from '../settings';
import type { Bucket, Dataset } from '../lib/types';
import { allocation, countryExposure, issuerExposure, type BarDatum } from '../lib/analytics';
import { Panel } from './ui';
import { Term } from './Term';
import type { TermKey } from '../i18n/glossary';

// fixed slot per entity (validated order: structured, bonds, equity, cash are adjacent in the bar)
export const BUCKET_COLOR: Record<Bucket, string> = {
  structured: 'var(--series-1)',
  bonds: 'var(--series-2)',
  equity: 'var(--series-3)',
  cash: 'var(--series-4)',
  options: 'var(--ink-3)',
  credit: 'var(--ink-3)',
};
const BUCKET_TERM: Partial<Record<Bucket, TermKey>> = { structured: 'structured', bonds: 'bond', equity: 'etf', cash: 'cash', options: 'coveredCall' };

export function Allocation({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  const a = allocation(ds);
  const [table, setTable] = useState(false);
  return (
    <Panel
      title={<Term k="allocation">{t.secAllocation}</Term>}
      className="span-4"
      aside={<button className="link small" onClick={() => setTable((v) => !v)}>{table ? t.hideTable : t.showTable}</button>}
    >
      <div className="stack" role="img" aria-label={a.slices.map((s) => `${t.bucket[s.bucket]} ${fmt.pct(s.share)}`).join(', ')}>
        {a.slices.map((s) => (
          <span key={s.bucket} style={{ flexGrow: s.value, background: BUCKET_COLOR[s.bucket] }} title={`${t.bucket[s.bucket]} · ${fmt.pct(s.share)}`} />
        ))}
      </div>
      <ul className="legend">
        {a.slices.map((s) => (
          <li key={s.bucket}>
            <span className="sw" style={{ background: BUCKET_COLOR[s.bucket] }} aria-hidden="true" />
            <span className="lbl">{BUCKET_TERM[s.bucket] ? <Term k={BUCKET_TERM[s.bucket]!}>{t.bucket[s.bucket]}</Term> : t.bucket[s.bucket]}</span>
            <span className="pct">{fmt.pct(s.share)}</span>
            {table && <span className="val">{fmt.usd(s.value)}</span>}
          </li>
        ))}
        {a.options !== 0 && (
          <li className="neg-line">
            <span className="sw hatched" aria-hidden="true" />
            <span className="lbl"><Term k="coveredCall">{t.options}</Term></span>
            <span className="pct">{fmt.pct(a.options / a.total)}</span>
            {table && <span className="val">{fmt.usd(a.options)}</span>}
          </li>
        )}
      </ul>
      {a.options !== 0 && <p className="note">{t.optionsNote}</p>}
    </Panel>
  );
}

function BarList({ data, labelFor }: { data: BarDatum[]; labelFor?: (l: string) => string }) {
  const { fmt } = useSettings();
  const max = Math.max(...data.map((d) => d.share));
  return (
    <ul className="barlist">
      {data.map((d) => (
        <li key={d.label} title={d.items.join('\n')}>
          <div className="bl-top">
            <span className="bl-label">{labelFor ? labelFor(d.label) : d.label}</span>
            <span className="bl-val">{fmt.usd(d.value)} <b>{fmt.pct(d.share)}</b></span>
          </div>
          <div className="bl-track"><span style={{ width: `${(d.share / max) * 100}%` }} /></div>
          <div className="bl-items">{d.items.join(' · ')}</div>
        </li>
      ))}
    </ul>
  );
}

export function Issuers({ ds }: { ds: Dataset }) {
  const { t } = useSettings();
  return (
    <Panel title={<Term k="concentration">{t.secIssuers}</Term>} className="span-4">
      <BarList data={issuerExposure(ds)} />
    </Panel>
  );
}

export function Countries({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  return (
    <Panel title={<Term k="countryRisk">{t.secCountries}</Term>} className="span-4">
      <BarList data={countryExposure(ds)} labelFor={(c) => `${fmt.country(c)} (${c})`} />
    </Panel>
  );
}
