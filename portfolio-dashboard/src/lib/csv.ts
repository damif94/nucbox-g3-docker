import Papa from 'papaparse';
import type { ExportKind } from './types';

export type Row = Record<string, string>;

export interface ParsedExport {
  kind: ExportKind;
  fileName: string;
  rows: Row[];
  /** raw file content, kept so the set can be stored on the server as-is */
  text: string;
}

// Each export is recognised by columns only it carries, not by file name.
const SIGNATURES: Record<ExportKind, string[]> = {
  positions: ['PositionID', 'MarketValueUSD - Settled'],
  activity: ['Transaction Code', 'Description BPS'],
  assets: ['Security Full Description', 'AssetTypeName'],
  accounts: ['Account Opening Date', 'Account Status'],
};

export function detectKind(headers: string[]): ExportKind | null {
  const set = new Set(headers);
  for (const [kind, cols] of Object.entries(SIGNATURES) as [ExportKind, string[]][]) {
    if (cols.every((c) => set.has(c))) return kind;
  }
  return null;
}

export function parseText(text: string, fileName: string): ParsedExport {
  const res = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: true,
    // fields are space-padded in these exports
    transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
    transform: (v) => v.trim(),
  });
  const kind = detectKind(res.meta.fields ?? []);
  if (!kind) throw new Error(`unrecognized:${fileName}`);
  return { kind, fileName, rows: res.data, text };
}

export async function parseExport(file: File): Promise<ParsedExport> {
  return parseText(await file.text(), file.name);
}
