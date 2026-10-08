// OpenFIGI enrichment. Only security identifiers are sent (via /api/figi), never account data.
import type { FigiInfo, Holding } from './types';
import { AuthError } from './session';

interface MappingJob {
  idType: string;
  idValue: string;
  securityType2?: string;
  marketSecDes?: string;
}
type RawFigi = Record<string, string | null>;
interface MappingResult {
  data?: RawFigi[];
  warning?: string;
  error?: string;
}

const CACHE_KEY = 'pd.figi.v1';
const BATCH = 10; // anonymous OpenFIGI limit per request

function readCache(): Record<string, FigiInfo | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function writeCache(c: Record<string, FigiInfo | null>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable: lookups just repeat next time */
  }
}

export function jobFor(h: Holding): MappingJob | null {
  if (h.isin) return { idType: 'ID_ISIN', idValue: h.isin };
  if (h.option) {
    const [y, m, d] = h.option.expiry.split('-');
    return {
      idType: 'TICKER',
      idValue: `${h.option.underlying} ${m}/${d}/${y.slice(2)} ${h.option.right}${h.option.strike}`,
      securityType2: 'Option',
      marketSecDes: 'Equity',
    };
  }
  if (h.cusip && /^[0-9A-Z]{9}$/.test(h.cusip)) return { idType: 'ID_CUSIP', idValue: h.cusip };
  return null;
}
const jobKey = (j: MappingJob) => `${j.idType}:${j.idValue}`;

function pick(data: RawFigi[]): FigiInfo {
  // prefer the US composite listing for multi-venue instruments (ETFs list on 100+ venues)
  const p = data.find((x) => x.exchCode === 'US') ?? data[0];
  return {
    figi: p.figi ?? '',
    compositeFIGI: p.compositeFIGI ?? null,
    shareClassFIGI: p.shareClassFIGI ?? null,
    ticker: p.ticker ?? null,
    name: p.name ?? null,
    securityType: p.securityType ?? null,
    securityType2: p.securityType2 ?? null,
    marketSector: p.marketSector ?? null,
    exchCode: p.exchCode ?? null,
    securityDescription: p.securityDescription ?? null,
    venues: data.length,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(jobs: MappingJob[], attempt = 0): Promise<MappingResult[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/figi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobs),
  });
  if (res.status === 429 && attempt < 3) {
    const reset = Number(res.headers.get('X-RateLimit-Reset')) || 6;
    await sleep(reset * 1000);
    return post(jobs, attempt + 1);
  }
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`OpenFIGI ${res.status}`);
  return res.json();
}

/** Returns a map holding.key -> FigiInfo|null. Uses a browser cache keyed by identifier. */
export async function enrichWithFigi(holdings: Holding[]): Promise<Map<string, FigiInfo | null>> {
  const cache = readCache();
  const jobs = new Map<string, MappingJob>();
  const keyOf = new Map<string, string>(); // holding.key -> job key
  for (const h of holdings) {
    const j = jobFor(h);
    if (!j) continue;
    keyOf.set(h.key, jobKey(j));
    if (!(jobKey(j) in cache)) jobs.set(jobKey(j), j);
  }
  const pending = [...jobs.values()];
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const results = await post(chunk);
    chunk.forEach((j, n) => {
      const data = results[n]?.data;
      cache[jobKey(j)] = data?.length ? pick(data) : null;
    });
    writeCache(cache);
  }
  const out = new Map<string, FigiInfo | null>();
  for (const h of holdings) out.set(h.key, keyOf.has(h.key) ? cache[keyOf.get(h.key)!] ?? null : null);
  return out;
}

export const figiUrl = (figi: string) => `https://www.openfigi.com/id/${figi}`;
