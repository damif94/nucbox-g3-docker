// Which business days the merged uploads cover, and — for Activity, which only has rows on
// days something happened — whether every movement is accounted for.
//
// Activity is checked against Positions: between two Positions snapshots, each account's
// cash change must equal the Activity cash dated in between, and every change in a
// security's quantity must have an Activity row for that security. A quiet stretch (nothing
// moved, nothing recorded) can't be missing anything, whether or not it was exported.
import type { Row } from './csv';
import type { ExportKind } from './types';
import { bucketOf, cashEffectOf } from './normalize';
import { isHoliday, weekdays } from './calendar';
import type { Merged } from './merge';

export type Cell =
  | 'covered' // snapshot present
  | 'missing' // snapshot absent on a business day
  | 'optional' // Accounts absent: not needed, Positions carries the account fields
  | 'closed' // bank holiday
  | 'verified' // activity: movements fully explained
  | 'quiet' // activity: nothing moved, nothing recorded
  | 'unexplained' // activity: something moved without a matching row
  | 'unchecked'; // activity: no Positions on both sides to check against

export interface Gap {
  kind: ExportKind;
  from: string;
  to: string;
  days: number;
}

export interface Unexplained {
  /** the stretch between two Positions snapshots: (after, upTo] */
  after: string;
  upTo: string;
  cash: { account: string; amount: number }[];
  quantity: { account: string; description: string; delta: number }[];
}

export interface Coverage {
  from: string;
  to: string;
  days: string[]; // weekdays from..to
  cells: Record<ExportKind, Map<string, Cell>>;
  gaps: Gap[];
  unexplained: Unexplained[];
}

const cents = (n: number) => Math.round(n * 100) / 100;
const num = (s: string | undefined) => {
  const n = parseFloat((s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function byDate(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(r.BusinessDate, [...(m.get(r.BusinessDate) ?? []), r]);
  return m;
}

function snapshot(rows: Row[]) {
  const cash = new Map<string, number>();
  const qty = new Map<string, { qty: number; account: string; assetId: string; description: string }>();
  for (const r of rows) {
    const b = bucketOf(r.AssetClass);
    if (b === 'cash') cash.set(r.AccountNumber, (cash.get(r.AccountNumber) ?? 0) + num(r['MarketValueUSD - Settled']));
    else if (b !== 'credit') {
      const k = `${r.AccountNumber}|${r.AssetID}`;
      const prev = qty.get(k);
      qty.set(k, { qty: (prev?.qty ?? 0) + num(r.Quantity), account: r.AccountNumber, assetId: r.AssetID, description: (r['Full Desc'] ?? '').replace(/\s+/g, ' ') });
    }
  }
  return { cash, qty };
}

export function coverage(m: Merged): Coverage {
  const all = Object.values(m.rows).flatMap((rows) => rows!.map((r) => r.BusinessDate)).filter(Boolean).sort();
  const from = all[0];
  const to = all.at(-1)!;
  const days = from ? weekdays(from, to) : [];
  const cells = Object.fromEntries((['positions', 'activity', 'assets', 'accounts'] as ExportKind[]).map((k) => [k, new Map<string, Cell>()])) as Coverage['cells'];

  for (const kind of ['positions', 'assets', 'accounts'] as ExportKind[]) {
    const have = m.providers[kind];
    for (const d of days) cells[kind].set(d, isHoliday(d) ? 'closed' : have?.has(d) ? 'covered' : kind === 'accounts' ? 'optional' : 'missing');
  }

  // Activity: reconcile each stretch between consecutive Positions snapshots
  const pos = byDate(m.rows.positions ?? []);
  const snaps = [...pos.keys()].sort();
  const act = m.rows.activity ?? [];
  const unexplained: Unexplained[] = [];
  const stretch = new Map<string, Cell>(); // upTo -> state
  for (let i = 1; i < snaps.length; i++) {
    const after = snaps[i - 1];
    const upTo = snaps[i];
    const a = snapshot(pos.get(after)!);
    const b = snapshot(pos.get(upTo)!);
    const rows = act.filter((r) => r.BusinessDate > after && r.BusinessDate <= upTo);
    const flows = new Map<string, number>();
    for (const r of rows) {
      const c = cashEffectOf(r);
      if (c) flows.set(r['Account Number'], (flows.get(r['Account Number']) ?? 0) + c);
    }
    const cash = [...new Set([...a.cash.keys(), ...b.cash.keys(), ...flows.keys()])]
      .map((account) => ({ account, amount: cents((b.cash.get(account) ?? 0) - (a.cash.get(account) ?? 0) - (flows.get(account) ?? 0)) }))
      .filter((x) => Math.abs(x.amount) >= 0.01);
    const touched = new Set(rows.map((r) => r.AssetID).filter(Boolean));
    const quantity = [...new Set([...a.qty.keys(), ...b.qty.keys()])]
      .map((k) => {
        const x = b.qty.get(k) ?? a.qty.get(k)!;
        return { account: x.account, assetId: x.assetId, description: x.description, delta: (b.qty.get(k)?.qty ?? 0) - (a.qty.get(k)?.qty ?? 0) };
      })
      .filter((x) => Math.abs(x.delta) > 1e-9 && !touched.has(x.assetId))
      .map(({ account, description, delta }) => ({ account, description, delta }));
    const moved = rows.length > 0 || [...a.cash.keys(), ...b.cash.keys()].some((k) => Math.abs((b.cash.get(k) ?? 0) - (a.cash.get(k) ?? 0)) >= 0.01);
    if (cash.length || quantity.length) {
      unexplained.push({ after, upTo, cash, quantity });
      stretch.set(upTo, 'unexplained');
    } else stretch.set(upTo, moved ? 'verified' : 'quiet');
  }
  for (const d of days) {
    if (isHoliday(d)) {
      cells.activity.set(d, 'closed');
      continue;
    }
    const upTo = snaps.find((s) => s >= d);
    const after = [...snaps].reverse().find((s) => s < d);
    cells.activity.set(d, upTo && after ? stretch.get(upTo)! : 'unchecked');
  }

  const gaps: Gap[] = [];
  for (const kind of ['positions', 'assets'] as ExportKind[]) {
    let run: Gap | null = null;
    for (const d of days) {
      const c = cells[kind].get(d);
      if (c === 'missing') {
        if (run) {
          run.to = d;
          run.days++;
        } else run = { kind, from: d, to: d, days: 1 };
      } else if (c !== 'closed' && run) {
        gaps.push(run);
        run = null;
      }
    }
    if (run) gaps.push(run);
  }
  return { from, to, days, cells, gaps, unexplained };
}
