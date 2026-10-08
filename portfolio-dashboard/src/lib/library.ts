// The upload library on the server (see deploy/nginx.conf.template): every export ever
// uploaded, kept exactly as exported. Nothing is merged on the server; merge.ts combines
// the uploads in the browser, so a parsing fix later re-reads every old file correctly.
import { parseText, type ParsedExport } from './csv';
import { AuthError } from './session';
import type { ExportKind } from './types';

export interface UploadMeta {
  v: 1;
  kind: ExportKind;
  fileName: string;
  uploadedAt: string; // ISO
  uploadedBy: string | null;
  sha256: string;
  cif: string | null;
}

export interface Upload extends UploadMeta {
  id: string;
  parsed: ParsedExport;
  /** when the bank produced the file: from its name (…_20261007_1809_…), else the upload time */
  exportedAt: string;
}

const BASE = `${import.meta.env.BASE_URL}api/library/`;

async function call(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  if (res.status === 401) throw new AuthError();
  if (!res.ok && !(init?.method === 'DELETE' && res.status === 404)) throw new Error(`${url.slice(BASE.length) || 'library'}: HTTP ${res.status}`);
  return res;
}

export function exportedAt(fileName: string, fallback: string): string {
  const m = fileName.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(?:_|\.)/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : fallback.slice(0, 16);
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const cifOf = (p: ParsedExport): string | null => p.rows.find((r) => r.CIF)?.CIF ?? null;

export async function loadLibrary(): Promise<Upload[]> {
  const listing = (await (await call(BASE)).json()) as { name: string; type: string }[];
  const names = new Set(listing.filter((e) => e.type === 'file').map((e) => e.name));
  const ids = [...names].filter((n) => n.endsWith('.json') && names.has(n.replace(/\.json$/, '.csv'))).map((n) => n.slice(0, -5));
  const uploads = await Promise.all(
    ids.map(async (id) => {
      const [meta, text] = await Promise.all([
        call(`${BASE}${id}.json`).then((r) => r.json() as Promise<UploadMeta>),
        call(`${BASE}${id}.csv`).then((r) => r.text()),
      ]);
      const parsed = parseText(text, meta.fileName);
      return { ...meta, kind: parsed.kind, id, parsed, exportedAt: exportedAt(meta.fileName, meta.uploadedAt) };
    }),
  );
  return uploads.sort((a, b) => a.exportedAt.localeCompare(b.exportedAt) || a.uploadedAt.localeCompare(b.uploadedAt));
}

/** Stores one upload: the CSV first, then the .json that makes it visible. */
export async function addUpload(p: ParsedExport, sha: string, user: string | null): Promise<void> {
  const id = crypto.randomUUID();
  const meta: UploadMeta = { v: 1, kind: p.kind, fileName: p.fileName, uploadedAt: new Date().toISOString(), uploadedBy: user, sha256: sha, cif: cifOf(p) };
  await call(`${BASE}${id}.csv`, { method: 'PUT', headers: { 'Content-Type': 'text/csv' }, body: p.text });
  await call(`${BASE}${id}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) });
}

/** Removes one upload: the .json first, so a half-finished delete never lists a missing file. */
export async function deleteUpload(id: string): Promise<void> {
  await call(`${BASE}${id}.json`, { method: 'DELETE' });
  await call(`${BASE}${id}.csv`, { method: 'DELETE' });
}
