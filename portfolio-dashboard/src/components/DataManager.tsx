import { useMemo, useRef, useState } from 'react';
import { useSettings } from '../settings';
import { parseExport, type ParsedExport } from '../lib/csv';
import { cifOf, exportedAt, sha256, type Upload } from '../lib/library';
import { KINDS, SNAPSHOT_KINDS, merge, spanOf, type Merged } from '../lib/merge';
import type { Cell, Coverage } from '../lib/coverage';
import type { ExportKind } from '../lib/types';
import { Logo } from './Logo';

export interface Pending {
  key: string;
  fileName: string;
  parsed?: ParsedExport;
  sha?: string;
  problem?: 'unknown' | 'duplicate' | 'otherClient';
}

/**
 * The data library: drop any mix of exports, preview what each adds, then see which business
 * days are covered and what is still missing (lib/coverage.ts does the checking).
 */
export function DataManager({
  uploads,
  merged,
  cov,
  notice,
  onSave,
  onDelete,
  onOpen,
}: {
  uploads: Upload[];
  merged: Merged;
  cov: Coverage | null;
  notice?: string | null;
  onSave: (files: Pending[]) => Promise<void>;
  onDelete: (u: Upload) => Promise<void>;
  onOpen?: () => void;
}) {
  const { t, fmt } = useSettings();
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cif = uploads.find((u) => u.cif)?.cif ?? null;

  async function accept(list: FileList | null) {
    if (!list?.length) return;
    const next = [...pending];
    for (const f of Array.from(list)) {
      const key = `${f.name}|${f.size}|${f.lastModified}`;
      if (next.some((p) => p.key === key)) continue;
      try {
        const parsed = await parseExport(f);
        const sha = await sha256(parsed.text);
        const dup = uploads.some((u) => u.sha256 === sha) || next.some((p) => p.sha === sha);
        // every export carries the client number (CIF): refuse another client's files
        const first = next.find((p) => p.parsed && !p.problem);
        const own = cif ?? (first ? cifOf(first.parsed!) : null);
        const other = own !== null && cifOf(parsed) !== null && cifOf(parsed) !== own;
        next.push({ key, fileName: f.name, parsed, sha, problem: dup ? 'duplicate' : other ? 'otherClient' : undefined });
      } catch {
        next.push({ key, fileName: f.name, problem: 'unknown' });
      }
    }
    setPending(next);
    if (input.current) input.current.value = '';
  }

  // what each pending file would contribute if saved now
  const preview = useMemo(() => {
    const ok = pending.filter((p) => p.parsed && !p.problem);
    const now = new Date().toISOString();
    const fake = ok.map(
      (p, i) =>
        ({ id: `pending-${i}`, kind: p.parsed!.kind, fileName: p.fileName, parsed: p.parsed!, exportedAt: exportedAt(p.fileName, now), uploadedAt: now } as Upload),
    );
    const all = [...uploads, ...fake].sort((a, b) => a.exportedAt.localeCompare(b.exportedAt) || a.uploadedAt.localeCompare(b.uploadedAt));
    const after = merge(all);
    return new Map<string, { kind: ExportKind; span: ReturnType<typeof spanOf>; total: number; added: number; replaced?: number }>(
      ok.map((p, i) => {
        const id = `pending-${i}`;
        const kind = p.parsed!.kind;
        const span = spanOf(fake[i]);
        if (!SNAPSHOT_KINDS.includes(kind)) return [p.key, { kind, span, total: p.parsed!.rows.length, added: after.used.get(id) ?? 0 }];
        const before = merged.providers[kind];
        const mine = [...(after.providers[kind] ?? new Map())].filter(([, v]) => v === id).map(([d]) => d);
        const fresh = mine.filter((d) => !before?.has(d)).length;
        return [p.key, { kind, span, total: span?.days ?? 0, added: fresh, replaced: mine.length - fresh }];
      }),
    );
  }, [pending, uploads, merged]);

  const saveable = pending.filter((p) => p.parsed && !p.problem);

  async function save() {
    setBusy(true);
    try {
      await onSave(saveable);
      setPending([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="data">
      <div className="upload-copy">
        <Logo size={56} className="hero" />
        <p className="eyebrow">{t.appName}</p>
        <h1>{t.dataTitle}</h1>
        <p className="lead">{uploads.length ? t.dataLead : t.dataLeadEmpty}</p>
      </div>
      {notice && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}

      <label
        className={`drop ${over ? 'is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          accept(e.dataTransfer.files);
        }}
      >
        <input ref={input} type="file" accept=".csv,text/csv" multiple onChange={(e) => accept(e.target.files)} />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="drop-icon">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{t.dataDrop}</span>
      </label>

      {pending.length > 0 && (
        <section className="panel pending" aria-label={t.dataPending}>
          <h2 className="sub">{t.dataPending}</h2>
          <ul className="pending-list">
            {pending.map((p) => {
              const pv = preview.get(p.key);
              return (
                <li key={p.key} className={p.problem ? 'bad' : ''}>
                  <span className="kind-tag">{p.parsed ? t.upKinds[p.parsed.kind] : '?'}</span>
                  <span className="f">{p.fileName}</span>
                  <span className="what">
                    {p.problem === 'unknown' && t.upErrUnknown(p.fileName)}
                    {p.problem === 'duplicate' && t.dataDuplicate}
                    {p.problem === 'otherClient' && t.dataOtherClient}
                    {pv && pv.span && (
                      <>
                        {fmt.date(pv.span.from)} – {fmt.date(pv.span.to)} ·{' '}
                        {SNAPSHOT_KINDS.includes(pv.kind) ? t.dataPreviewDays(pv.total, pv.added, pv.replaced ?? 0) : t.dataPreviewRows(pv.total, pv.added)}
                      </>
                    )}
                  </span>
                  <button className="btn ghost sm" onClick={() => setPending(pending.filter((x) => x.key !== p.key))} aria-label={t.dataRemovePending(p.fileName)}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="upload-actions">
            <button className="btn primary" disabled={busy || !saveable.length} onClick={save}>
              {busy ? t.dataSaving : t.dataSave(saveable.length)}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setPending([])}>
              {t.dataDiscard}
            </button>
          </div>
        </section>
      )}

      {cov && cov.days.length > 0 && <Timeline cov={cov} merged={merged} uploads={uploads} />}
      {cov && cov.days.length > 0 && <Issues cov={cov} />}

      {onOpen && (
        <div className="upload-actions">
          <button className="btn primary" onClick={onOpen}>
            {t.upOpen}
          </button>
        </div>
      )}

      {uploads.length > 0 && <UploadList uploads={uploads} merged={merged} onDelete={onDelete} />}
      <p className="fine">{t.upPrivacy}</p>
    </main>
  );
}

const STATE_ORDER: Cell[] = ['covered', 'verified', 'quiet', 'missing', 'unexplained', 'unchecked', 'optional', 'closed'];

function Timeline({ cov, merged, uploads }: { cov: Coverage; merged: Merged; uploads: Upload[] }) {
  const { t, fmt, lang } = useSettings();
  const names = new Map(uploads.map((u) => [u.id, u.fileName]));
  const months = new Map<string, string[]>();
  for (const d of cov.days) months.set(d.slice(0, 7), [...(months.get(d.slice(0, 7)) ?? []), d]);
  const used = new Set(KINDS.flatMap((k) => [...cov.cells[k].values()]));
  const scroller = useRef<HTMLDivElement | null>(null);
  return (
    <section className="panel" aria-label={t.dataTimeline}>
      <h2 className="sub">{t.dataTimeline}</h2>
      <p className="muted small">{t.dataRange(fmt.date(cov.from, 'long'), fmt.date(cov.to, 'long'))}</p>
      <div className="tl">
        <div className="tl-labels" aria-hidden="true">
          <span />
          {KINDS.map((k) => (
            <span key={k}>
              {t.upKinds[k]}
              {k === 'accounts' && <em> {t.dataOptional}</em>}
            </span>
          ))}
        </div>
        <div
          className="tl-scroll"
          ref={(el) => {
            // newest data on the right: start scrolled to the end
            if (el && !scroller.current) el.scrollLeft = el.scrollWidth;
            scroller.current = el;
          }}
        >
          {[...months].map(([m, days]) => (
            <div className="tl-month" key={m}>
              <span className="tl-month-label">{new Date(m + '-01T00:00:00Z').toLocaleDateString(lang, { month: 'short', year: '2-digit', timeZone: 'UTC' })}</span>
              {KINDS.map((k) => (
                <div className="tl-row" key={k} role="list" aria-label={`${t.upKinds[k]} · ${m}`}>
                  {days.map((d) => {
                    const c = cov.cells[k].get(d)!;
                    const src = merged.providers[k]?.get(d);
                    const label = `${fmt.date(d, 'long')} · ${t.cell[c]}${src ? ` · ${names.get(src)}` : ''}`;
                    return <span key={d} role="listitem" className={`tl-cell c-${c}`} title={label} aria-label={label} />;
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <ul className="tl-legend">
        {STATE_ORDER.filter((c) => used.has(c)).map((c) => (
          <li key={c}>
            <span className={`tl-cell c-${c}`} aria-hidden="true" /> {t.cell[c]}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Issues({ cov }: { cov: Coverage }) {
  const { t, fmt } = useSettings();
  const acct = (n: string) => `…${n.slice(-4)}`;
  const posGaps = cov.gaps.filter((g) => g.kind === 'positions');
  const refGaps = cov.gaps.filter((g) => g.kind === 'assets');
  const ok = !posGaps.length && !cov.unexplained.length;
  return (
    <section className="panel" aria-label={t.dataIssues}>
      <h2 className="sub">{t.dataIssues}</h2>
      {ok && <p className="ok-note">✓ {t.dataAllGood}</p>}
      <ul className="issues">
        {posGaps.map((g) => (
          <li key={`p${g.from}`} className="bad">
            {t.dataGap(t.upKinds.positions, fmt.date(g.from, 'long'), fmt.date(g.to, 'long'), g.days)}
          </li>
        ))}
        {cov.unexplained.map((u) => (
          <li key={`u${u.upTo}`} className="bad">
            {t.dataUnexplainedHead(fmt.date(u.after, 'long'), fmt.date(u.upTo, 'long'))}
            <ul>
              {u.cash.map((c) => (
                <li key={c.account}>{t.dataUnexplainedCash(acct(c.account), fmt.signedUsd(c.amount, 2))}</li>
              ))}
              {u.quantity.map((q) => (
                <li key={q.account + q.description}>{t.dataUnexplainedQty(acct(q.account), q.description, fmt.num(q.delta, 0))}</li>
              ))}
            </ul>
          </li>
        ))}
        {refGaps.map((g) => (
          <li key={`a${g.from}`} className="warn">
            {t.dataGapRef(fmt.date(g.from, 'long'), fmt.date(g.to, 'long'), g.days)}
          </li>
        ))}
      </ul>
      {!ok && (
        <p className="todo">
          <b>{t.dataTodo}</b>{' '}
          {[
            ...posGaps.map((g) => t.dataTodoBoth(fmt.date(g.from), fmt.date(g.to))),
            ...cov.unexplained.map((u) => t.dataTodoActivity(fmt.date(u.after), fmt.date(u.upTo))),
          ].join(' · ')}
        </p>
      )}
    </section>
  );
}

function UploadList({ uploads, merged, onDelete }: { uploads: Upload[]; merged: Merged; onDelete: (u: Upload) => Promise<void> }) {
  const { t, fmt, lang } = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const rows = [...uploads].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return (
    <section className="panel" aria-label={t.dataUploads}>
      <h2 className="sub">{t.dataUploads}</h2>
      <div className="table-wrap">
        <table className="uploads">
          <thead>
            <tr>
              <th>{t.dataColKind}</th>
              <th>{t.dataColFile}</th>
              <th>{t.dataColDates}</th>
              <th>{t.dataColAdded}</th>
              <th>{t.dataColUse}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const span = spanOf(u);
              const n = merged.used.get(u.id) ?? 0;
              return (
                <tr key={u.id} className={n ? '' : 'superseded'}>
                  <td>
                    <span className="kind-tag">{t.upKinds[u.kind as ExportKind]}</span>
                  </td>
                  <td className="mono f" title={u.fileName}>
                    {u.fileName}
                  </td>
                  <td className="nowrap">{span ? `${fmt.date(span.from)} – ${fmt.date(span.to)}` : '—'}</td>
                  <td className="nowrap">
                    {new Date(u.uploadedAt).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: '2-digit' })}
                    {u.uploadedBy && <span className="muted"> · {u.uploadedBy}</span>}
                  </td>
                  <td className="nowrap">{n ? (SNAPSHOT_KINDS.includes(u.kind) ? t.dataUseDays(n) : t.dataUseRows(n)) : <span className="muted">{t.dataSuperseded}</span>}</td>
                  <td>
                    <button
                      className="btn ghost sm"
                      disabled={busy === u.id}
                      onClick={async () => {
                        if (!window.confirm(t.dataConfirmDelete(u.fileName))) return;
                        setBusy(u.id);
                        try {
                          await onDelete(u);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {t.dataDelete}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
