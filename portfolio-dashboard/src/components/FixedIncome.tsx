import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { useSettings } from '../settings';
import type { Dataset } from '../lib/types';
import { bondStats, daysBetween, maturityLadder, upcomingEvents, type EventKind } from '../lib/analytics';
import { Panel, useHoldingName } from './ui';
import { Term } from './Term';
import type { TermKey } from '../i18n/glossary';

export function FixedIncome({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  const s = bondStats(ds);
  const ladder = maturityLadder(ds).map((d) => ({ ...d, name: t.ladder[d.bucket] }));
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof ladder)[number];
    return (
      <div className="chart-tip">
        <div className="tip-date">{d.name}</div>
        <div className="tip-row"><b>{fmt.usd(d.value)}</b></div>
        {d.items.map((i) => <div key={i} className="tip-item">{i}</div>)}
      </div>
    );
  };
  return (
    <Panel title={t.secFixedIncome} className="span-7">
      <div className="mini-stats">
        <div><span><Term k="ytw">{t.fiYtw}</Term></span><b>{fmt.num(s.ytw, 2)}%</b></div>
        <div><span><Term k="duration">{t.fiDuration}</Term></span><b>{fmt.num(s.duration, 1)}</b></div>
        <div><span><Term k="coupon">{t.fiCoupon}</Term></span><b>{fmt.num(s.coupon, 2)}%</b></div>
        <div><span><Term k="face">{t.fiFace}</Term></span><b>{fmt.usd(s.face)}</b></div>
      </div>
      <p className="note">{t.fiWeighted}</p>
      <h3 className="sub-h"><Term k="ladder" /></h3>
      <div className="chart" style={{ height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={ladder} margin={{ top: 20, right: 8, bottom: 0, left: 8 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} interval={0} />
            <YAxis tickFormatter={fmt.usdCompact} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={<Tip />} cursor={{ fill: 'var(--hover)' }} />
            <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="value" position="top" formatter={(v: number) => (v ? fmt.usdCompact(v) : '')} style={{ fill: 'var(--ink-2)', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

const EVENT_TERM: Record<EventKind, TermKey> = { coupon: 'coupon', observation: 'observation', call: 'callable', expiry: 'expiry', maturity: 'maturity', credit: 'creditLine' };

export function Events({ ds, onOpen }: { ds: Dataset; onOpen: (key: string) => void }) {
  const { t, fmt } = useSettings();
  const name = useHoldingName();
  const ev = upcomingEvents(ds);
  return (
    <Panel title={t.secEvents} className="span-5">
      {ev.length === 0 ? (
        <p className="muted">{t.noEvents}</p>
      ) : (
        <ol className="events">
          {ev.map((e, i) => (
            <li key={i}>
              <button className="ev" onClick={() => e.holding && onOpen(e.holding.key)}>
                <span className="ev-date">
                  <b>{fmt.dayMonth(e.date)}</b>
                  <span>{t.inDays(daysBetween(ds.asOf, e.date))}</span>
                </span>
                <span className="ev-body">
                  <span className={`ev-kind k-${e.kind}`}><Term k={EVENT_TERM[e.kind]}>{t.ev[e.kind]}</Term></span>
                  <span className="ev-name">{e.holding ? name(e.holding) : e.label}</span>
                </span>
                <span className="ev-amt">{e.amount ? fmt.usd(e.amount, 2) : ''}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
