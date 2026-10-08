import { useRef, useState } from 'react';
import { useSettings } from '../settings';
import { parseExport, type ParsedExport } from '../lib/csv';
import { normalize } from '../lib/normalize';
import type { Dataset, ExportKind } from '../lib/types';

const KINDS: ExportKind[] = ['accounts', 'positions', 'assets', 'activity'];

export function Upload({ onLoaded }: { onLoaded: (ds: Dataset) => void }) {
  const { t } = useSettings();
  const [files, setFiles] = useState<Partial<Record<ExportKind, ParsedExport>>>({});
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function accept(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const next = { ...files };
    for (const f of Array.from(list)) {
      try {
        const p = await parseExport(f);
        next[p.kind] = p;
      } catch (e) {
        const msg = String((e as Error).message);
        setError(msg.startsWith('unrecognized:') ? t.upErrUnknown(f.name) : msg);
      }
    }
    setFiles(next);
    const missing = KINDS.filter((k) => !next[k]);
    if (missing.length === 0) {
      try {
        onLoaded(normalize(Object.values(next) as ParsedExport[]));
      } catch (e) {
        setError(String((e as Error).message));
      }
    }
  }

  return (
    <main className="upload">
      <div className="upload-copy">
        <p className="eyebrow">{t.appName}</p>
        <h1>{t.upTitle}</h1>
        <p className="lead">{t.upLead}</p>
      </div>
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
            <span className="f">{files[k]?.fileName ?? t.upWaiting}</span>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error.startsWith('missing:') ? t.upErrMissing(error.slice(8)) : error}
        </p>
      )}
      <p className="fine">{t.upPrivacy}</p>
    </main>
  );
}
