import type { Lang } from '../i18n/strings';

const LOCALE: Record<Lang, string> = { es: 'es-MX', en: 'en-US' };
const cache = new Map<string, Intl.NumberFormat>();
const nf = (lang: Lang, opts: Intl.NumberFormatOptions) => {
  const k = lang + JSON.stringify(opts);
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(LOCALE[lang], opts));
  return cache.get(k)!;
};

export const makeFormat = (lang: Lang) => ({
  usd: (v: number, digits = 0) => nf(lang, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
  usdCompact: (v: number) => nf(lang, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 }).format(v),
  signedUsd: (v: number, digits = 0) =>
    (v > 0 ? '+' : v < 0 ? '−' : '') + nf(lang, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v)),
  num: (v: number, digits = 0) => nf(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
  pct: (v: number, digits = 1) => nf(lang, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
  signedPct: (v: number, digits = 2) =>
    (v > 0 ? '+' : v < 0 ? '−' : '') + nf(lang, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v)),
  date: (iso: string | null, style: 'short' | 'long' = 'short') => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString(LOCALE[lang], style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
  },
  dayMonth: (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  country: (code: string) => {
    try {
      return new Intl.DisplayNames([LOCALE[lang]], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  },
});

export type Fmt = ReturnType<typeof makeFormat>;
