// Combines every upload in the library into one row set per export kind.
//
// Positions, Securities and Accounts are daily snapshots: each day's rows come from exactly
// one upload — the most recently exported one that has that day — never a mix, which would
// double-count holdings. Activity is a ledger: overlapping exports repeat the same rows, so
// rows are matched whole and the merged set keeps, per distinct row, the largest count seen
// in any single upload (two identical fees on one day survive; a re-export doesn't double them).
import type { Row } from './csv';
import type { ExportKind } from './types';
import type { Upload } from './library';

export const KINDS: ExportKind[] = ['positions', 'activity', 'assets', 'accounts'];
export const SNAPSHOT_KINDS: ExportKind[] = ['positions', 'assets', 'accounts'];

export interface Merged {
  rows: Partial<Record<ExportKind, Row[]>>;
  /** snapshot kinds: date -> id of the upload supplying that day */
  providers: Partial<Record<ExportKind, Map<string, string>>>;
  /** per upload: days (snapshots) or rows (activity) it supplies to the merged set; 0 = superseded */
  used: Map<string, number>;
  sources: Partial<Record<ExportKind, string[]>>;
}

const rowKey = (r: Row) =>
  Object.keys(r)
    .sort()
    .map((k) => r[k])
    .join('\u001f');

/** uploads must be sorted oldest export first (loadLibrary does that) */
export function merge(uploads: Upload[]): Merged {
  const out: Merged = { rows: {}, providers: {}, used: new Map(uploads.map((u) => [u.id, 0])), sources: {} };

  for (const kind of SNAPSHOT_KINDS) {
    const byDay = new Map<string, { id: string; rows: Row[] }>();
    for (const u of uploads.filter((x) => x.kind === kind)) {
      const days = new Map<string, Row[]>();
      for (const r of u.parsed.rows) days.set(r.BusinessDate, [...(days.get(r.BusinessDate) ?? []), r]);
      for (const [d, rows] of days) byDay.set(d, { id: u.id, rows }); // later export wins
    }
    if (!byDay.size) continue;
    const dates = [...byDay.keys()].sort();
    out.rows[kind] = dates.flatMap((d) => byDay.get(d)!.rows);
    out.providers[kind] = new Map(dates.map((d) => [d, byDay.get(d)!.id]));
    for (const { id } of byDay.values()) out.used.set(id, out.used.get(id)! + 1);
  }

  const emitted = new Map<string, number>();
  const activity: Row[] = [];
  for (const u of uploads.filter((x) => x.kind === 'activity')) {
    const local = new Map<string, number>();
    for (const r of u.parsed.rows) {
      const k = rowKey(r);
      const n = (local.get(k) ?? 0) + 1;
      local.set(k, n);
      if (n > (emitted.get(k) ?? 0)) {
        emitted.set(k, n);
        activity.push(r);
        out.used.set(u.id, out.used.get(u.id)! + 1);
      }
    }
  }
  if (activity.length) out.rows.activity = activity;

  for (const kind of KINDS) {
    const names = uploads.filter((u) => u.kind === kind && out.used.get(u.id)! > 0).map((u) => u.fileName);
    if (names.length) out.sources[kind] = names;
  }
  return out;
}

/** Date range an upload's rows span (snapshots: BusinessDate; activity: BusinessDate). */
export function spanOf(u: Upload): { from: string; to: string; days: number } | null {
  const dates = [...new Set(u.parsed.rows.map((r) => r.BusinessDate).filter(Boolean))].sort();
  return dates.length ? { from: dates[0], to: dates.at(-1)!, days: dates.length } : null;
}
