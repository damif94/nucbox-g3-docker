import { Fragment } from 'react';
import { useSettings } from '../settings';
import type { Bucket, Dataset, Holding } from '../lib/types';
import { optionShares, unrealized } from '../lib/analytics';
import { Delta, Panel, useHoldingName } from './ui';
import { Term } from './Term';
import { BUCKET_COLOR } from './Exposure';

const GROUPS: Bucket[] = ['structured', 'bonds', 'equity', 'options', 'cash'];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function Holdings({ ds, figiState, onOpen, onRetry }: { ds: Dataset; figiState: 'idle' | 'loading' | 'done' | 'error'; onOpen: (k: string) => void; onRetry: () => void }) {
  const { t, fmt } = useSettings();
  const name = useHoldingName();
  const total = ds.history.at(-1)!.total;

  const sub = (h: Holding) => {
    if (h.option) {
      // "covered" only makes sense for a sold call: the shares held are what would be delivered
      const shares = optionShares(h);
      const und = ds.holdings.find((x) => x.bucket === 'equity' && x.ref.ticker === h.option!.underlying);
      const covered = h.option.right === 'C' && h.quantity < 0 && shares !== null && und && und.quantity >= shares;
      return covered ? t.coveredBy(und.quantity, h.option.underlying) : h.description;
    }
    if (h.bucket === 'cash') return `${h.account} · ${h.entity}`;
    return [h.isin, h.figi?.name ?? h.ref.issuer].filter(Boolean).join(' · ');
  };
  const qty = (h: Holding) => (h.bucket === 'cash' ? '' : fmt.num(h.quantity));
  const px = (h: Holding, v: number | null) => (v == null ? '—' : h.bucket === 'bonds' || h.bucket === 'structured' ? `${fmt.num(v, 2)}%` : fmt.usd(v, 2));

  return (
    <Panel
      title={t.secHoldings}
      className="span-12"
      aside={
        <span className="small muted">
          {figiState === 'loading' && <span className="spinner" aria-hidden="true" />}
          {figiState === 'loading' ? t.figiLoading : figiState === 'error' ? <>{t.figiError} <button className="link" onClick={onRetry}>{t.figiRetry}</button></> : t.clickHint}
        </span>
      }
    >
      <div className="table-wrap">
        <table className="holdings">
          <thead>
            <tr>
              <th className="l">{t.thInstrument}</th>
              <th><Term k="face">{t.thQty}</Term></th>
              <th><Term k="avgCost">{t.thAvgCost}</Term></th>
              <th><Term k="pricePct">{t.thPrice}</Term></th>
              <th><Term k="marketValue">{t.thMV}</Term></th>
              <th><Term k="accrued">{t.thAccrued}</Term></th>
              <th><Term k="unrealized">{t.thUnrealized}</Term></th>
              <th>{t.thWeight}</th>
              <th><Term k="ytw">{t.thYield}</Term></th>
              <th><Term k="duration">{t.thDuration}</Term></th>
              <th><Term k="maturity">{t.thMaturity}</Term></th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => {
              const rows = ds.holdings.filter((h) => h.bucket === g);
              if (!rows.length) return null;
              const mv = sum(rows.map((h) => h.marketValue));
              const ai = sum(rows.map((h) => h.accrued));
              const upl = rows.some((h) => h.costBasis != null) ? sum(rows.map((h) => unrealized(h) ?? 0)) : null;
              return (
                <Fragment key={g}>
                  <tr className="group">
                    <th className="l" colSpan={4} scope="rowgroup">
                      <span className="sw" style={{ background: BUCKET_COLOR[g] }} aria-hidden="true" /> {t.bucket[g]} <span className="muted">· {rows.length}</span>
                    </th>
                    <td>{fmt.usd(mv)}</td>
                    <td>{ai ? fmt.usd(ai) : ''}</td>
                    <td>{upl != null && <Delta value={upl}>{fmt.signedUsd(upl)}</Delta>}</td>
                    <td>{fmt.pct(mv / total)}</td>
                    <td colSpan={3} />
                  </tr>
                  {rows.map((h) => {
                    const u = unrealized(h);
                    return (
                      <tr key={h.key} className="row" tabIndex={0} onClick={() => onOpen(h.key)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(h.key))}>
                        <td className="l inst">
                          <span className="inst-name">{name(h)}</span>
                          <span className="inst-sub">{sub(h)}</span>
                        </td>
                        <td>{qty(h)}</td>
                        <td>{px(h, h.avgCost)}</td>
                        <td>{px(h, h.price)}</td>
                        <td className="strong">{fmt.usd(h.marketValue, 2)}</td>
                        <td>{h.accrued ? fmt.usd(h.accrued, 2) : ''}</td>
                        <td>{u != null && <Delta value={u}>{fmt.signedUsd(u)} <small>{fmt.signedPct(u / Math.abs(h.costBasis!), 1)}</small></Delta>}</td>
                        <td>{fmt.pct(h.marketValue / total)}</td>
                        <td>{h.ytw ? `${fmt.num(h.ytw, 2)}%` : '—'}</td>
                        <td>{h.duration ? fmt.num(h.duration, 1) : '—'}</td>
                        <td>{h.ref.maturityType === 'PERP/CALL' ? <Term k="perpetual" /> : fmt.date(h.option?.expiry ?? h.maturity)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="l" colSpan={4}>{t.total}</th>
              <td>{fmt.usd(total, 2)}</td>
              <td>{fmt.usd(sum(ds.holdings.map((h) => h.accrued)), 2)}</td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}
