import Papa from 'papaparse';
import type { ExportKind } from './types';

export type Row = Record<string, string>;

export interface ParsedExport {
  kind: ExportKind;
  fileName: string;
  rows: Row[];
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

export function parseExport(file: File): Promise<ParsedExport> {
  return new Promise((resolve, reject) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      // fields are space-padded in these exports
      transformHeader: (h) => h.replace(/^﻿/, '').trim(),
      transform: (v) => v.trim(),
      complete: (res) => {
        const kind = detectKind(res.meta.fields ?? []);
        if (!kind) {
          reject(new Error(`unrecognized:${file.name}`));
          return;
        }
        resolve({ kind, fileName: file.name, rows: res.data });
      },
      error: (err) => reject(err),
    });
  });
}
