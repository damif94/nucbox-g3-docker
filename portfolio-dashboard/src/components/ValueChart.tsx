import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceDot, type TooltipProps } from 'recharts';
import { useSettings } from '../settings';
import type { Dataset } from '../lib/types';
import { flowsByDate } from '../lib/analytics';
import { businessDaysBetween } from '../lib/calendar';
import { Panel } from './ui';
import { Term } from './Term';

export function ValueChart({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  const flows = flowsByDate(ds);
  // one point per business day: days without a Positions snapshot stay empty, so the line
  // breaks there instead of drawing a made-up path across the gap
  const byDate = new Map(ds.history.map((h) => [h.date, h]));
  const dates = [...new Set([...businessDaysBetween(ds.first, ds.asOf), ...byDate.keys()])].sort();
  let prev: number | null = null;
  const data = dates.map((date) => {
    const h = byDate.get(date);
    const point = { date, total: h?.total ?? null, dayChange: h && prev !== null ? h.total - prev : 0, flow: flows.get(date) ?? 0 };
    if (h) prev = h.total;
    return point;
  });
  const vals = ds.history.map((d) => d.total);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || hi * 0.01;
  const step = niceStep((hi - lo + 2 * pad) / 4);
  const domain = [Math.floor((lo - pad) / step) * step, Math.ceil((hi + pad) / step) * step];
  const last = { date: ds.asOf, total: ds.history.at(-1)!.total };

  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as (typeof data)[number];
    if (d.total === null)
      return (
        <div className="chart-tip">
          <div className="tip-date">{fmt.date(d.date, 'long')}</div>
          <div className="muted">{t.chartNoData}</div>
        </div>
      );
    return (
      <div className="chart-tip">
        <div className="tip-date">{fmt.date(d.date, 'long')}</div>
        <div className="tip-row"><span>{t.chartTotal}</span><b>{fmt.usd(d.total, 2)}</b></div>
        <div className="tip-row"><span>{t.chartDayChange}</span><b>{fmt.signedUsd(d.dayChange, 2)}</b></div>
        {d.flow !== 0 && <div className="tip-row"><span>{t.chartFlow}</span><b>{fmt.signedUsd(d.flow, 2)}</b></div>}
      </div>
    );
  };

  return (
    <Panel title={t.secPerformance} className="span-8" aside={<span className="muted small">{fmt.date(ds.first)} – {fmt.date(ds.asOf)}</span>}>
      <div className="chart" style={{ height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="date" tickFormatter={fmt.dayMonth} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} minTickGap={28} />
            <YAxis domain={domain} ticks={range(domain[0], domain[1], step)} tickFormatter={fmt.usdCompact} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<Tip />} cursor={{ stroke: 'var(--ink-3)', strokeDasharray: '3 3' }} />
            <Line type="monotone" dataKey="total" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
            {data.filter((d) => d.flow !== 0 && d.total !== null).map((d) => (
              <ReferenceDot key={d.date} x={d.date} y={d.total!} r={5} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={2} />
            ))}
            <ReferenceDot x={last.date} y={last.total} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="note"><span className="flow-dot" aria-hidden="true" /> <Term k="flows">{t.chartNote}</Term></p>
    </Panel>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function range(a: number, b: number, s: number) {
  const out: number[] = [];
  for (let v = a; v <= b + s / 2; v += s) out.push(Math.round(v));
  return out;
}
