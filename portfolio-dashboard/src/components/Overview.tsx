import { useSettings } from '../settings';
import type { Dataset } from '../lib/types';
import { alerts, summary, type Alert } from '../lib/analytics';
import { Delta } from './ui';
import { Term } from './Term';

export function Kpis({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  const s = summary(ds);
  return (
    <div className="kpis">
      <div className="kpi hero">
        <div className="kpi-label"><Term k="nav">{t.kTotal}</Term></div>
        <div className="kpi-value">{fmt.usd(s.total, 2)}</div>
        <div className="kpi-sub">
          <Delta value={s.change}>{fmt.signedUsd(s.change)} ({fmt.signedPct(s.changePct)})</Delta> {t.kChangeSub(fmt.date(ds.first))}
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label"><Term k="unrealized">{t.kUnrealized}</Term></div>
        <div className="kpi-value"><Delta value={s.unrealized}>{fmt.signedUsd(s.unrealized)}</Delta></div>
        <div className="kpi-sub">{fmt.signedPct(s.unrealizedPct)} {t.kUnrealizedSub}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label"><Term k="cash">{t.kCash}</Term></div>
        <div className="kpi-value">{fmt.usd(s.cash)}</div>
        <div className="kpi-sub">{t.kCashSub(fmt.pct(s.cash / s.total))}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label"><Term k="accrued">{t.kAccrued}</Term></div>
        <div className="kpi-value">{fmt.usd(s.accrued)}</div>
        <div className="kpi-sub">{t.kAccruedSub}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label"><Term k="income">{t.kIncome}</Term></div>
        <div className="kpi-value">{fmt.usd(s.incomeFixed)}</div>
        <div className="kpi-sub">
          <Term k="contingent">{t.kIncomeSub(fmt.usd(s.incomeConditional))}</Term>
        </div>
      </div>
    </div>
  );
}

const ICON: Record<Alert['severity'], string> = { critical: '⛔', warning: '⚠', info: 'ℹ' };

export function Alerts({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  const list = alerts(ds);
  if (!list.length) return null;
  const text = (a: Alert) => {
    const p = a.params;
    switch (a.id) {
      case 'shortCallItm':
        return t.alert.shortCallItm({ und: String(p.und), strike: fmt.usd(+p.strike, 2), px: fmt.usd(+p.px, 2), expiry: fmt.date(String(p.expiry), 'long'), shares: +p.shares < 0 ? null : +p.shares });
      case 'shortPutItm':
        return t.alert.shortPutItm({ und: String(p.und), strike: fmt.usd(+p.strike, 2), px: fmt.usd(+p.px, 2), expiry: fmt.date(String(p.expiry), 'long'), shares: +p.shares < 0 ? null : +p.shares });
      case 'structuredConc':
        return t.alert.structuredConc({ pct: fmt.pct(+p.pct, 0) });
      case 'issuerConc':
        return t.alert.issuerConc({ issuer: String(p.issuer), pct: fmt.pct(+p.pct, 0) });
      case 'bondsBelowCost':
        return t.alert.bondsBelowCost({ n: +p.n, amount: fmt.signedUsd(+p.amount), pct: fmt.signedPct(+p.pct, 1) });
      case 'creditLineMaturity':
        return t.alert.creditLineMaturity({ date: fmt.date(String(p.date), 'long'), balance: fmt.usd(+p.balance) });
      default:
        return a.id;
    }
  };
  return (
    <section className="alerts" aria-label={t.secAttention}>
      <h2 className="sr">{t.secAttention}</h2>
      {list.map((a, i) => (
        <div key={i} className={`alert sev-${a.severity}`}>
          <span className="alert-tag">
            <span aria-hidden="true">{ICON[a.severity]}</span> {t.severity[a.severity]}
          </span>
          <p>{text(a)}</p>
        </div>
      ))}
    </section>
  );
}
