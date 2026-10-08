// The last uploaded CSV set, stored on the server (nginx WebDAV, behind basic auth) and
// shared by every login, so the dashboard opens without uploading anything.
import { parseText, type ParsedExport } from './csv';
import type { ExportKind } from './types';

export const KINDS: ExportKind[] = ['accounts', 'positions', 'assets', 'activity'];

export type ExportSet = Record<ExportKind, ParsedExport>;

interface Meta {
  savedAt: string;
  files: Record<ExportKind, string>;
}

export interface Stored {
  savedAt: string;
  files: ExportSet;
}

const BASE = `${import.meta.env.BASE_URL}api/data/`;

async function get(name: string): Promise<Response> {
  const res = await fetch(BASE + name, { cache: 'no-store' });
  if (!res.ok && res.status !== 404) throw new Error(`${name}: HTTP ${res.status}`);
  return res;
}

/** null when nothing has been stored yet */
export async function loadStored(): Promise<Stored | null> {
  const res = await get('meta.json');
  if (res.status === 404) return null;
  const meta = (await res.json()) as Meta;
  const parsed = await Promise.all(
    KINDS.map(async (k) => {
      const r = await get(`${k}.csv`);
      if (r.status === 404) throw new Error(`${k}.csv: missing`);
      const p = parseText(await r.text(), meta.files[k] ?? `${k}.csv`);
      if (p.kind !== k) throw new Error(`${k}.csv: holds a ${p.kind} export`);
      return p;
    }),
  );
  return { savedAt: meta.savedAt, files: Object.fromEntries(parsed.map((p) => [p.kind, p])) as ExportSet };
}

async function put(name: string, body: string, type: string) {
  const res = await fetch(BASE + name, { method: 'PUT', headers: { 'Content-Type': type }, body });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
}

/** Writes the changed CSVs, then meta.json last so it never points at a set that didn't land. */
export async function saveStored(all: ExportSet, changed: ExportKind[]): Promise<Stored> {
  for (const k of changed) await put(`${k}.csv`, all[k].text, 'text/csv');
  const meta: Meta = {
    savedAt: new Date().toISOString(),
    files: Object.fromEntries(KINDS.map((k) => [k, all[k].fileName])) as Record<ExportKind, string>,
  };
  await put('meta.json', JSON.stringify(meta), 'application/json');
  return { savedAt: meta.savedAt, files: all };
}
