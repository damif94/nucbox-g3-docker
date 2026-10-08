import { useSettings } from '../settings';
import type { Dataset } from '../lib/types';
import { changeBreakdown } from '../lib/analytics';
import type { Coverage } from '../lib/coverage';
import { Panel } from './ui';
import { Term } from './Term';
import type { TermKey } from '../i18n/glossary';

/** Statement-style "change in account value", with diverging bars for the three drivers. */
export function ChangeSummary({ ds, cov }: { ds: Dataset; cov: Coverage | null }) {
  const { t, fmt } = useSettings();
  const c = changeBreakdown(ds);
  // stretches inside the period where Activity doesn't explain what moved (lib/coverage.ts)
  const holes = (cov?.unexplained ?? []).filter((u) => u.upTo > ds.first && u.after < ds.asOf);
  const unexplainedCash = holes.flatMap((u) => u.cash).reduce((s, x) => s + x.amount, 0);
  const drivers: { label: string; term: TermKey; v: number }[] = [
    { label: t.chContrib, term: 'flows', v: c.contributions },
    { label: t.chWithdraw, term: 'flows', v: c.withdrawals },
    { label: t.chInvest, term: 'investmentResult', v: c.investment },
  ];
  const max = Math.max(...drivers.map((d) => Math.abs(d.v)), 1);
  return (
    <Panel title={t.secChange} className="span-4">
      {holes.length > 0 && (
        <p className="note warn" role="status">
          ⚠ {t.chGapsWarn(fmt.date(holes[0].after), fmt.date(holes.at(-1)!.upTo), unexplainedCash ? fmt.signedUsd(unexplainedCash, 2) : '—')}
        </p>
      )}
      <dl className="change">
        <div className="row strong">
          <dt>{t.chStart} <span className="muted small">{fmt.date(ds.first)}</span></dt>
          <dd>{fmt.usd(c.start, 2)}</dd>
        </div>
        {drivers.map((d) => (
          <div className="row" key={d.label}>
            <dt><Term k={d.term}>{d.label}</Term></dt>
            <dd>
              <span className="dbar" aria-hidden="true">
                <span className={d.v >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(d.v) / max) * 50}%`, [d.v >= 0 ? 'left' : 'right']: '50%' }} />
              </span>
              <span className={`num ${d.v >= 0 ? 'up' : 'down'}`}>{fmt.signedUsd(d.v, 2)}</span>
            </dd>
          </div>
        ))}
        <div className="row strong total">
          <dt>{t.chEnd} <span className="muted small">{fmt.date(ds.asOf)}</span></dt>
          <dd>{fmt.usd(c.end, 2)}</dd>
        </div>
      </dl>
      <div className="cash-income">
        <div className="small muted">{t.chCashIncome}</div>
        <ul>
          <li><span>{t.chCoupons}</span><b>{fmt.usd(c.couponsReceived, 2)}</b></li>
          <li>
            <span>{t.chDividends} <span className="muted">(<Term k="withholding">{t.chTax}</Term> {fmt.usd(c.taxWithheld, 2)})</span></span>
            <b>{fmt.usd(c.dividendsReceived, 2)}</b>
          </li>
          {c.redemptions !== 0 && <li><span><Term k="earlyRedemption">{t.chRedemptions}</Term></span><b>{fmt.usd(c.redemptions, 2)}</b></li>}
          {c.purchases !== 0 && <li><span>{t.chPurchases}</span><b>{fmt.signedUsd(c.purchases, 2)}</b></li>}
        </ul>
      </div>
    </Panel>
  );
}
