import { useState } from 'react';
import { useSettings } from '../settings';
import type { Dataset, Txn } from '../lib/types';
import { Panel } from './ui';
import { Term } from './Term';

type Filter = 'all' | 'cash' | 'securities';

/**
 * The ledger for the selected period: same window as "change this period" (after the
 * starting snapshot, up to and including the last), so its flows add up to that panel.
 */
export function Activity({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  const [filter, setFilter] = useState<Filter>('all');
  const [showContra, setShowContra] = useState(false);
  const inPeriod = ds.activity.filter((x) => x.businessDate > ds.first && x.businessDate <= ds.asOf);
  const rows = inPeriod.filter(
    (x) => (showContra || x.kind !== 'contra') && (filter === 'all' || (filter === 'cash' ? x.banking || x.kind === 'dividend' : !x.banking)),
  );
  const detail = (x: Txn) => {
    if (x.quantity && x.price) return `${fmt.num(Math.abs(x.quantity))} @ ${fmt.num(x.price, 2)}%`;
    if (x.quantity) return fmt.num(x.quantity);
    return null;
  };
  return (
    <Panel
      title={t.secActivity}
      className="span-12"
      aside={
        <div className="filters">
          <div className="seg" role="group">
            {(['all', 'cash', 'securities'] as Filter[]).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? t.filterAll : f === 'cash' ? t.filterCash : t.filterSecurities}
              </button>
            ))}
          </div>
          <label className="check">
            <input id="show-contra" type="checkbox" checked={showContra} onChange={(e) => setShowContra(e.target.checked)} />
            <Term k="contra">{t.showContra}</Term>
          </label>
        </div>
      }
    >
      <p className="muted small act-range">{t.actRange(fmt.date(ds.first), fmt.date(ds.asOf), rows.length)}</p>
      <div className="table-wrap">
        <table className="activity">
          <thead>
            <tr>
              <th className="l">{t.thDate}</th>
              <th className="l">{t.thType}</th>
              <th className="l">{t.thDescription}</th>
              <th className="l">{t.thAccount}</th>
              <th>{t.thAmount}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="l muted">{t.noRows}</td></tr>
            )}
            {rows.map((x) => (
              <tr key={x.id} className={x.kind === 'contra' ? 'contra' : ''}>
                <td className="l nowrap">
                  {fmt.date(x.date)}
                  {x.settleDate && x.settleDate !== x.date && <span className="inst-sub"><Term k="tradeSettle">→ {fmt.date(x.settleDate)}</Term></span>}
                </td>
                <td className="l">
                  <span className={`kind k-${x.kind}`}>
                    {x.code && <code>{x.code}</code>} {t.kinds[x.kind]}
                  </span>
                  {x.external && <span className="tag">{t.external}</span>}
                </td>
                <td className="l desc">
                  <span>{x.description}</span>
                  {(x.isin || detail(x)) && <span className="inst-sub">{[x.isin, detail(x)].filter(Boolean).join(' · ')}</span>}
                  {x.taxWithheld && <span className="inst-sub"><Term k="withholding">{t.chTax}</Term>: {fmt.usd(x.taxWithheld, 2)}</span>}
                </td>
                <td className="l mono small">{x.account}</td>
                <td className="strong nowrap">
                  {x.cashEffect == null ? <span className="muted">—</span> : <span className={x.cashEffect > 0 ? 'up' : x.cashEffect < 0 ? 'down' : ''}>{fmt.signedUsd(x.cashEffect, 2)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
