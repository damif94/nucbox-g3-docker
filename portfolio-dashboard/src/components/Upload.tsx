import { useRef, useState } from 'react';
import { useSettings } from '../settings';
import { parseExport, type ParsedExport } from '../lib/csv';
import { KINDS, type ExportSet } from '../lib/store';
import type { ExportKind } from '../lib/types';

/**
 * Pre-filled with the stored set (when there is one): dropping files replaces just those
 * kinds, and the rest fall back to what is already stored.
 */
export function Upload({
  stored,
  notice,
  onOpen,
  onBack,
}: {
  stored: ExportSet | null;
  notice?: string | null;
  onOpen: (all: ExportSet, changed: ExportKind[]) => string | null;
  onBack?: () => void;
}) {
  const { t } = useSettings();
  const [files, setFiles] = useState<Partial<ExportSet>>(stored ?? {});
  const [fresh, setFresh] = useState<ExportKind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const complete = (f: Partial<ExportSet>): f is ExportSet => KINDS.every((k) => f[k]);

  function open(all: ExportSet, changed: ExportKind[]) {
    const err = onOpen(all, changed);
    if (err) setError(err);
  }

  async function accept(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const next: Partial<ExportSet> = { ...files };
    const changed = new Set(fresh);
    for (const f of Array.from(list)) {
      try {
        const p: ParsedExport = await parseExport(f);
        next[p.kind] = p;
        changed.add(p.kind);
      } catch (e) {
        const msg = String((e as Error).message);
        setError(msg.startsWith('unrecognized:') ? t.upErrUnknown(f.name) : msg);
      }
    }
    setFiles(next);
    setFresh([...changed]);
    // first-ever upload: open as soon as the set is complete; otherwise wait for the button
    if (!stored && complete(next)) open(next, [...changed]);
  }

  return (
    <main className="upload">
      <div className="upload-copy">
        <p className="eyebrow">{t.appName}</p>
        <h1>{t.upTitle}</h1>
        <p className="lead">{stored ? t.upLeadStored : t.upLead}</p>
      </div>
      {notice && <p className="error" role="alert">{notice}</p>}
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
        <input id="csv-input" ref={input} type="file" accept=".csv,text/csv" multiple onChange={(e) => accept(e.target.files)} />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="drop-icon">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{t.upDrop}</span>
      </label>
      <ul className="file-checklist">
        {KINDS.map((k) => (
          <li key={k} className={files[k] ? 'ok' : ''}>
            <span className="chk" aria-hidden="true">{files[k] ? '✓' : ''}</span>
            <span className="k">{t.upKinds[k]}</span>
            <span className="f">
              {files[k]?.fileName ?? t.upWaiting}
              {files[k] && !fresh.includes(k) && <em className="saved-tag">{t.upSaved}</em>}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error.startsWith('missing:') ? t.upErrMissing(error.slice(8)) : error}
        </p>
      )}
      {stored && (
        <div className="upload-actions">
          <button className="btn primary" disabled={!fresh.length || !complete(files)} onClick={() => complete(files) && open(files, fresh)}>
            {t.upOpen}
          </button>
          {onBack && (
            <button className="btn ghost" onClick={onBack}>
              {t.upBack}
            </button>
          )}
        </div>
      )}
      <p className="fine">{t.upPrivacy}</p>
    </main>
  );
}
