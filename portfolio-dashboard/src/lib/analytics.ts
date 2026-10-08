import type { Bucket, Dataset, Holding, Txn } from './types';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Unrealized P&L excludes accrued interest (that is income, not price change). */
export const unrealized = (h: Holding) => (h.costBasis == null ? null : h.marketValue - h.accrued - h.costBasis);

export interface Summary {
  total: number;
  cash: number;
  accrued: number;
  unrealized: number;
  unrealizedPct: number;
  start: number;
  change: number;
  changePct: number;
  incomeFixed: number; // bond coupons + ETF dividends (12m estimate)
  incomeConditional: number; // structured-note coupons: contingent or paid at maturity
}

export function summary(ds: Dataset): Summary {
  const H = ds.holdings;
  const priced = H.filter((h) => h.costBasis != null);
  const upl = sum(priced.map((h) => unrealized(h)!));
  const longCost = sum(priced.filter((h) => h.costBasis! > 0).map((h) => h.costBasis!));
  const total = ds.history.at(-1)!.total;
  const start = ds.history[0].total;
  const incomeFixed = sum(
    H.map((h) => {
      if (h.bucket === 'bonds' && h.rate) return (h.quantity * h.rate) / 100;
      if (h.bucket === 'equity' && h.ref.dividendYield) return (h.marketValue * h.ref.dividendYield) / 100;
      return 0;
    }),
  );
  const incomeConditional = sum(H.filter((h) => h.bucket === 'structured' && h.rate).map((h) => (h.quantity * h.rate!) / 100));
  return {
    total,
    cash: sum(H.filter((h) => h.bucket === 'cash').map((h) => h.marketValue)),
    accrued: sum(H.map((h) => h.accrued)),
    unrealized: upl,
    unrealizedPct: longCost ? upl / longCost : 0,
    start,
    change: total - start,
    changePct: start ? (total - start) / start : 0,
    incomeFixed,
    incomeConditional,
  };
}

export interface ChangeBreakdown {
  start: number;
  end: number;
  contributions: number; // external money in
  withdrawals: number; // external money out (negative)
  investment: number; // residual: price moves + accrued income + fees
  couponsReceived: number;
  dividendsReceived: number;
  taxWithheld: number;
  redemptions: number;
  purchases: number;
}

export type Period = '1m' | '3m' | 'ytd' | '1y' | 'all';
export const PERIODS: Period[] = ['1m', '3m', 'ytd', '1y', 'all'];

/** The dataset seen over a period ending on its last day (history and `first` cut to the period). */
export function periodView(ds: Dataset, p: Period): Dataset {
  if (p === 'all') return ds;
  const end = new Date(ds.asOf + 'T00:00:00Z');
  const from =
    p === 'ytd'
      ? `${ds.asOf.slice(0, 4)}-01-01`
      : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (p === '1m' ? 1 : p === '3m' ? 3 : 12), end.getUTCDate())).toISOString().slice(0, 10);
  // start on the last snapshot on/before `from`, so the period's change is measured from a real value
  const startIdx = Math.max(0, ds.history.findLastIndex((h) => h.date <= from));
  const history = ds.history.slice(startIdx);
  return history.length < 2 ? ds : { ...ds, history, first: history[0].date };
}

/**
 * The dataset between two dates, for "change this period". Each end snaps to the last
 * Positions snapshot on/before it (the start falls forward to the first snapshot when it is
 * earlier than all of them), so both ends are real portfolio values. null when the range
 * holds fewer than two snapshots.
 */
export function rangeView(ds: Dataset, from: string, to: string): Dataset | null {
  const h = ds.history;
  const i = Math.max(0, h.findLastIndex((d) => d.date <= from));
  const j = h.findLastIndex((d) => d.date <= to);
  if (j <= i) return null;
  const history = h.slice(i, j + 1);
  return { ...ds, history, first: history[0].date, asOf: history.at(-1)!.date };
}

export function changeBreakdown(ds: Dataset): ChangeBreakdown {
  const A = ds.activity.filter((t) => t.businessDate > ds.first && t.businessDate <= ds.asOf);
  const ext = A.filter((t) => t.external && t.cashEffect != null);
  const contributions = sum(ext.filter((t) => t.cashEffect! > 0).map((t) => t.cashEffect!));
  const withdrawals = sum(ext.filter((t) => t.cashEffect! < 0).map((t) => t.cashEffect!));
  const start = ds.history[0].total;
  const end = ds.history.at(-1)!.total;
  const of = (k: Txn['kind']) => sum(A.filter((t) => t.kind === k).map((t) => t.cashEffect ?? 0));
  return {
    start,
    end,
    contributions,
    withdrawals,
    investment: end - start - contributions - withdrawals,
    couponsReceived: of('coupon'),
    dividendsReceived: of('dividend'),
    taxWithheld: sum(A.map((t) => t.taxWithheld ?? 0)),
    redemptions: of('redemption'),
    purchases: of('purchase'),
  };
}

/** External cash flows per business date, for chart markers. */
export function flowsByDate(ds: Dataset): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of ds.activity) if (t.external && t.cashEffect) m.set(t.businessDate, (m.get(t.businessDate) ?? 0) + t.cashEffect);
  return m;
}

export const ALLOC_ORDER: Bucket[] = ['structured', 'bonds', 'equity', 'cash'];

export function allocation(ds: Dataset) {
  const total = ds.history.at(-1)!.total;
  const by = (b: Bucket) => sum(ds.holdings.filter((h) => h.bucket === b).map((h) => h.marketValue));
  return {
    total,
    slices: ALLOC_ORDER.map((b) => ({ bucket: b, value: by(b), share: by(b) / total })).filter((s) => s.value !== 0),
    options: by('options'),
  };
}

// Groups legal entities of the same banking group so concentration reflects real counterparty risk.
export function parentIssuer(h: Holding): string {
  const s = `${h.ref.issuer ?? ''} ${h.description}`.toUpperCase();
  if (/J\.?P\.? ?MORGAN/.test(s)) return 'J.P. Morgan';
  if (/HSBC/.test(s)) return 'HSBC';
  if (/CREDIT AGRICOLE/.test(s)) return 'Crédit Agricole';
  if (/CITIGROUP/.test(s)) return 'Citigroup';
  if (/TREASURY/.test(s)) return 'U.S. Treasury';
  if (/PETROLEOS MEXICANOS/.test(s)) return 'Pemex';
  if (/ECOPETROL/.test(s)) return 'Ecopetrol';
  if (/PETROBRAS/.test(s)) return 'Petrobras';
  if (/SPDR GOLD/.test(s)) return 'SPDR Gold Shares (GLD)';
  if (/ENERGY SELECT/.test(s)) return 'Energy Select Sector SPDR (XLE)';
  return h.ref.issuer ?? h.description;
}

export interface BarDatum {
  label: string;
  value: number;
  share: number;
  items: string[];
}

function groupBars(ds: Dataset, keyOf: (h: Holding) => string | null): BarDatum[] {
  const total = ds.history.at(-1)!.total;
  const m = new Map<string, BarDatum>();
  for (const h of ds.holdings) {
    if (h.bucket === 'cash' || h.bucket === 'credit' || h.bucket === 'options') continue;
    const k = keyOf(h);
    if (!k) continue;
    const d = m.get(k) ?? { label: k, value: 0, share: 0, items: [] };
    d.value += h.marketValue;
    d.items.push(displayName(h));
    m.set(k, d);
  }
  return [...m.values()].map((d) => ({ ...d, share: d.value / total })).sort((a, b) => b.value - a.value);
}

export const issuerExposure = (ds: Dataset) => groupBars(ds, parentIssuer);
export const countryExposure = (ds: Dataset) => groupBars(ds, (h) => h.ref.countryRisk ?? (h.bucket === 'equity' ? 'US' : null));

export const LADDER = ['lt1', '1to3', '3to5', '5to10', '10to20', 'gt20'] as const;
export type LadderBucket = (typeof LADDER)[number];

export function maturityLadder(ds: Dataset): (BarDatum & { bucket: LadderBucket })[] {
  const res = LADDER.map((b) => ({ bucket: b, label: b, value: 0, share: 0, items: [] as string[] }));
  for (const h of ds.holdings) {
    if ((h.bucket !== 'bonds' && h.bucket !== 'structured') || !h.maturity) continue;
    const yrs = daysBetween(ds.asOf, h.maturity) / 365.25;
    const i = yrs < 1 ? 0 : yrs < 3 ? 1 : yrs < 5 ? 2 : yrs < 10 ? 3 : yrs < 20 ? 4 : 5;
    res[i].value += h.marketValue;
    res[i].items.push(displayName(h));
  }
  return res;
}

/** Market-value-weighted stats over plain bonds (structured notes report no comparable yield). */
export function bondStats(ds: Dataset) {
  const B = ds.holdings.filter((h) => h.bucket === 'bonds');
  const w = sum(B.map((h) => h.marketValue));
  const wavg = (f: (h: Holding) => number | null) => (w ? sum(B.map((h) => (f(h) ?? 0) * h.marketValue)) / w : 0);
  return {
    value: w,
    count: B.length,
    ytw: wavg((h) => h.ytw),
    duration: wavg((h) => h.duration),
    coupon: wavg((h) => h.rate),
    face: sum(B.map((h) => h.quantity)),
  };
}

export type EventKind = 'coupon' | 'observation' | 'call' | 'expiry' | 'maturity' | 'credit';
export interface UpcomingEvent {
  date: string;
  kind: EventKind;
  holding?: Holding;
  amount?: number | null;
  label: string;
}

export function upcomingEvents(ds: Dataset, horizonDays = 200): UpcomingEvent[] {
  const ev: UpcomingEvent[] = [];
  const inRange = (d: string | null) => !!d && d > ds.asOf && daysBetween(ds.asOf, d) <= horizonDays;
  for (const h of ds.holdings) {
    const name = displayName(h);
    if (inRange(h.nextCouponDate)) {
      const paid = (h.nextCouponAmount ?? 0) > 0;
      ev.push({ date: h.nextCouponDate!, kind: paid ? 'coupon' : 'observation', holding: h, amount: paid ? h.nextCouponAmount : null, label: name });
    }
    if (inRange(h.ref.nextCall)) ev.push({ date: h.ref.nextCall!, kind: 'call', holding: h, label: name });
    if (h.option && inRange(h.option.expiry)) ev.push({ date: h.option.expiry, kind: 'expiry', holding: h, label: name });
    else if (h.bucket === 'credit' && inRange(h.maturity)) ev.push({ date: h.maturity!, kind: 'credit', holding: h, label: name });
    else if (h.bucket !== 'options' && h.bucket !== 'credit' && inRange(h.maturity)) ev.push({ date: h.maturity!, kind: 'maturity', holding: h, amount: h.quantity, label: name });
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}

export type Severity = 'critical' | 'warning' | 'info';
export interface Alert {
  id: string;
  severity: Severity;
  params: Record<string, string | number>;
}

export function alerts(ds: Dataset): Alert[] {
  const out: Alert[] = [];
  const H = ds.holdings;
  const total = ds.history.at(-1)!.total;
  for (const o of H.filter((h) => h.option)) {
    const und = H.find((h) => h.bucket === 'equity' && (h.ref.ticker ?? h.figi?.ticker) === o.option!.underlying);
    if (!und?.price) continue;
    const call = o.option!.right === 'C';
    const itm = call ? und.price > o.option!.strike : und.price < o.option!.strike;
    // only sold options carry an obligation; a sold put means buying the shares, not selling
    if (itm && o.quantity < 0) {
      out.push({
        id: call ? 'shortCallItm' : 'shortPutItm',
        severity: 'warning',
        // -1 = adjusted contract, deliverable unknown (params are plain numbers/strings)
        params: { und: o.option!.underlying, strike: o.option!.strike, px: und.price, expiry: o.option!.expiry, shares: optionShares(o) ?? -1 },
      });
    }
  }
  const structured = sum(H.filter((h) => h.bucket === 'structured').map((h) => h.marketValue));
  if (structured / total > 0.4) out.push({ id: 'structuredConc', severity: 'warning', params: { pct: structured / total } });
  const top = issuerExposure(ds)[0];
  if (top && top.share > 0.2) out.push({ id: 'issuerConc', severity: 'warning', params: { issuer: top.label, pct: top.share } });
  const loss = H.filter((h) => h.bucket === 'bonds' && (unrealized(h) ?? 0) < 0);
  if (loss.length) {
    const u = sum(loss.map((h) => unrealized(h)!));
    const c = sum(loss.map((h) => h.costBasis!));
    out.push({ id: 'bondsBelowCost', severity: 'info', params: { n: loss.length, amount: u, pct: u / c } });
  }
  const credit = H.find((h) => h.bucket === 'credit');
  if (credit?.maturity && daysBetween(ds.asOf, credit.maturity) < 180)
    out.push({ id: 'creditLineMaturity', severity: 'info', params: { date: credit.maturity, balance: credit.marketValue } });
  return out;
}

const OPTION_SHARES = 100;

/**
 * Shares the position delivers at exercise, or null for a contract adjusted by a corporate
 * action ("ADJ" in the description): its deliverable is no longer 100 shares per contract
 * and the export doesn't say what it is.
 */
export function optionShares(h: Holding): number | null {
  if (!h.option || h.option.adjusted) return null;
  return Math.abs(h.quantity) * OPTION_SHARES;
}

/** Short human name: OpenFIGI ticker when known, else the bank description. */
export function displayName(h: Holding): string {
  if (h.figi?.ticker && h.bucket !== 'equity') return h.figi.ticker;
  if (h.bucket === 'equity') return h.ref.ticker ?? h.figi?.ticker ?? h.description;
  return h.description;
}

/** Underlyings referenced by a structured note, e.g. "LKD TO SPY,IWM,QQQ". */
export function noteUnderlyings(h: Holding): string[] {
  const m = h.description.match(/LKD TO ([A-Z0-9 ,]+?)(?: REG S|\s+\d|$)/);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}
