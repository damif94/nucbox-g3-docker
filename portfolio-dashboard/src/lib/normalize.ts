// Normalizes the four Safra NB CSV exports into one Dataset.
// Field semantics: financial-companion repo, docs/formats/safra-csv-exports.md
import type { Row, ParsedExport } from './csv';
import type { Account, Bucket, Dataset, DayValue, ExportKind, Holding, InstrumentRef, OptionTerms, Txn, TxnKind } from './types';

const NULL_DATE = '1900-01-01';

const str = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' || s === 'N.A.' || s === NULL_DATE ? null : s;
};
const num = (v: string | undefined): number => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};
// zero means "not populated" for analytic fields (yields, coupons, prices)
const numOrNull = (v: string | undefined): number | null => num(v) || null;

const BUCKETS: Record<string, Bucket> = {
  DDA: 'cash',
  'Other Cash': 'cash',
  Loan: 'credit',
  Bonds: 'bonds',
  'Structured Product': 'structured',
  Stocks: 'equity',
  Options: 'options',
};
export const bucketOf = (assetClass: string): Bucket => BUCKETS[assetClass] ?? 'cash';

const latestBy = (rows: Row[], key: string): Map<string, Row> => {
  const out = new Map<string, Row>();
  for (const r of rows) {
    const prev = out.get(r[key]);
    if (!prev || r.BusinessDate >= prev.BusinessDate) out.set(r[key], r);
  }
  return out;
};

function toRef(a: Row | undefined): InstrumentRef {
  return {
    ticker: str(a?.['Ticker Symbol']),
    issuer: str(a?.ISSUER),
    issueDate: str(a?.ISSUE_DT),
    maturityType: str(a?.['Maturity type']),
    countryRisk: str(a?.['Country of Risk']),
    countryIssue: str(a?.['Country of Issue']),
    coupon: numOrNull(a?.Coupon),
    couponFreq: str(a?.CPN_FREQ),
    nextCall: str(a?.['Next Call Date']),
    callFeature: str(a?.CALL_FEATURE),
    nextCallPrice: numOrNull(a?.NXT_CALL_PX),
    ratingSP: str(a?.['RTG SP']),
    ratingMoody: str(a?.MOODY),
    ratingBbg: str(a?.['Bloomberg Composite']),
    sector: str(a?.INDUSTRY_SECTOR),
    industry: str(a?.['Industry Group']),
    subIndustry: str(a?.INDUSTRY_SUBGROUP),
    paymentRank: str(a?.['Payment Rank']),
    structuredType: str(a?.['Structured Product Sub Asset Class']),
    dividendYield: numOrNull(a?.DIVIDEND_INDICATED_YIELD),
    fundFocus: str(a?.FUND_ASSET_CLASS_FOCUS),
    marketSector: str(a?.['Bloomberg Market Sector']),
    underlyingSecId: str(a?.Underlying),
  };
}

// "CALL GLD    01/15/27   370 SPDR GOLD TR" -> { C, GLD, 2027-01-15, 370 }
export function parseOption(desc: string): OptionTerms | null {
  const m = desc.match(/^(CALL|PUT)\s+(\S+)\s+(\d{2})\/(\d{2})\/(\d{2})\s+([\d.]+)/);
  if (!m) return null;
  return {
    right: m[1] === 'CALL' ? 'C' : 'P',
    underlying: m[2],
    expiry: `20${m[5]}-${m[3]}-${m[4]}`,
    strike: parseFloat(m[6]),
    adjusted: /\bADJ\b/.test(desc),
  };
}

const OPTION_MULTIPLIER = 100;

function costBasis(bucket: Bucket, qty: number, avgCost: number): number | null {
  if (!avgCost) return null;
  switch (bucket) {
    case 'bonds':
    case 'structured':
      return (qty * avgCost) / 100; // price quoted as % of face value
    case 'equity':
      return qty * avgCost;
    case 'options':
      return qty * avgCost * OPTION_MULTIPLIER;
    default:
      return null;
  }
}

function buildHoldings(positions: Row[], refs: Map<string, Row>, asOf: string): Holding[] {
  return positions
    .filter((r) => r.BusinessDate === asOf)
    .map((r) => {
      const bucket = bucketOf(r.AssetClass);
      const a = refs.get(r.AssetID);
      const description = str(a?.['Security Full Description']) ?? r['Full Desc'];
      const qty = num(r.Quantity);
      return {
        key: `${r.AccountNumber}:${r.AssetID}`,
        assetId: r.AssetID,
        account: r.AccountNumber,
        entity: r.Entity,
        category: r.AssetCategory,
        assetClass: r.AssetClass,
        bucket,
        subType: str(a?.AssetSubTypeName),
        description: description.replace(/\s+/g, ' '),
        isin: str(r.ISIN),
        cusip: str(r.Cusip),
        sedol: str(r.Sedol),
        secId: str(r.BPSA) ?? str(a?.SecID),
        commonCode: str(a?.CommonCode),
        quantity: qty,
        settledQuantity: num(r.Settled),
        avgCost: numOrNull(r['Avg Cost USD']),
        price: numOrNull(r['ClosingPrice USD']),
        priceDate: str(r.LastPriceDate),
        marketValue: num(r['MarketValueUSD - Settled']),
        marketValueTrade: num(r['MarketValueUSD - Trade']),
        accrued: num(r.AccruedIntUSD),
        costBasis: costBasis(bucket, qty, num(r['Avg Cost USD'])),
        rate: numOrNull(r.Rate),
        ytw: numOrNull(r.YTW),
        ytm: numOrNull(r.YTM),
        ytc: numOrNull(r.YTC),
        duration: numOrNull(r.Duration),
        maturity: str(r.Maturity),
        nextCouponDate: str(r.NextCoupDate),
        nextCouponAmount: numOrNull(r.NextCoupAmt),
        option: bucket === 'options' ? parseOption(description) : null,
        ref: toRef(a),
      } satisfies Holding;
    })
    .sort((x, y) => Math.abs(y.marketValue) - Math.abs(x.marketValue));
}

function buildHistory(positions: Row[]): DayValue[] {
  const days = new Map<string, DayValue>();
  for (const r of positions) {
    const d = days.get(r.BusinessDate) ?? { date: r.BusinessDate, total: 0, totalTrade: 0, byBucket: {} };
    const mv = num(r['MarketValueUSD - Settled']);
    const b = bucketOf(r.AssetClass);
    d.total += mv;
    d.totalTrade += num(r['MarketValueUSD - Trade']);
    d.byBucket[b] = (d.byBucket[b] ?? 0) + mv;
    days.set(r.BusinessDate, d);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildAccounts(rows: Row[]): Account[] {
  const last = rows.reduce((m, r) => (r.BusinessDate > m ? r.BusinessDate : m), '');
  const out = new Map<string, Account>();
  for (const r of rows.filter((x) => x.BusinessDate === last)) {
    const acc = out.get(r.AccountNumber) ?? {
      number: r.AccountNumber,
      entity: r.Entity,
      description: str(r['Account Description']),
      type: r['Account Type'],
      status: r['Account Status'],
      currency: r.Currency,
      opened: str(r['Account Opening Date']),
      lines: [],
    };
    acc.lines.push({ category: r.AssetCategory, assetClass: r.AssetClass, opened: str(r['Account Opening Date']) });
    if (acc.opened == null || (str(r['Account Opening Date']) ?? '9') < acc.opened) acc.opened = str(r['Account Opening Date']);
    out.set(r.AccountNumber, acc);
  }
  return [...out.values()];
}

// "Trf fr Pers CK 11111111 To Pers CK 22222222 ..." -> the other side of the transfer
function transferContra(desc: string, own: string): string | null {
  const m = desc.match(/Trf fr Pers CK (\d+) To Pers CK (\d+)/i);
  if (!m) return null;
  return m[1] === own ? m[2] : m[1];
}

function classify(r: Row, tracked: Set<string>): Pick<Txn, 'kind' | 'external' | 'cashEffect' | 'code'> {
  const banking = r.IsBankingAcct.toUpperCase() === 'TRUE';
  const desc = r.Description || r['Description BPS'];
  if (banking) {
    const code = str(r['Transaction Code']);
    const amount = num(r.Credit) + num(r.Debit); // Debit is already negative
    const isCredit = r['D/C'] === 'C';
    let kind: TxnKind = 'other';
    let external = false;
    switch (code) {
      case '163':
        kind = isCredit ? 'deposit' : 'withdrawal';
        external = true;
        break;
      case '114':
      case '113': {
        kind = code === '114' ? 'transfer_in' : 'transfer_out';
        const contra = transferContra(desc, r['Account Number']);
        external = !contra || !tracked.has(contra);
        break;
      }
      case '68':
        kind = 'transfer_out';
        external = true;
        break;
      case '162':
        kind = /REDEMPTION/i.test(desc) ? 'redemption' : 'coupon';
        break;
      case '182':
        kind = /CUSTODY FEE/i.test(desc) ? 'fee' : 'purchase';
        break;
      case '335':
        kind = 'fee';
        break;
      case '889':
        kind = 'rate_change';
        break;
    }
    return { kind, external, cashEffect: amount || (kind === 'rate_change' ? null : 0), code };
  }
  // Contra / security legs: the DDA leg carries the cash, except dividends paid into the margin account.
  const trx = str(r.Transaction_Code);
  const entry = str(r.Entry_Code);
  if (trx === 'Buy') return { kind: 'buy', external: false, cashEffect: null, code: trx };
  if (trx === 'Cancel Buy') return { kind: 'cancel_buy', external: false, cashEffect: null, code: trx };
  if (entry === 'DIV') return { kind: 'dividend', external: false, cashEffect: num(r.NetAmount), code: entry };
  return { kind: 'contra', external: false, cashEffect: null, code: entry ?? trx };
}

function buildActivity(rows: Row[], tracked: Set<string>): Txn[] {
  return rows
    .map((r, i) => {
      const banking = r.IsBankingAcct.toUpperCase() === 'TRUE';
      const c = classify(r, tracked);
      const tradeDate = str(r.Trade_Date);
      return {
        id: i,
        businessDate: r.BusinessDate,
        date: (banking ? str(r['Effective Date']) ?? str(r['Transaction Date']) : tradeDate) ?? r.BusinessDate,
        account: r['Account Number'],
        entity: r.Entity,
        assetClass: r.AssetClass,
        banking,
        ...c,
        description: (r.Description || r['Description BPS']).replace(/\s+/g, ' ').replace(/ (Credit|Debit) 0$/, ''),
        isin: str(r.ISIN),
        secId: str(r.SecID),
        quantity: numOrNull(r.Quantity),
        price: numOrNull(r.Price),
        taxWithheld: numOrNull(r.Tax_wthld_amt),
        tradeDate,
        settleDate: str(r.Settle_Date),
      } satisfies Txn;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export function normalize(files: ParsedExport[]): Dataset {
  const byKind = new Map<ExportKind, ParsedExport>();
  for (const f of files) byKind.set(f.kind, f);
  const missing = (['accounts', 'activity', 'positions', 'assets'] as ExportKind[]).filter((k) => !byKind.has(k));
  if (missing.length) throw new Error(`missing:${missing.join(',')}`);

  const positions = byKind.get('positions')!.rows;
  const accounts = buildAccounts(byKind.get('accounts')!.rows);
  const history = buildHistory(positions);
  const asOf = history.at(-1)!.date;
  const tracked = new Set(accounts.map((a) => a.number));
  return {
    cif: positions[0]?.CIF ?? '',
    asOf,
    first: history[0].date,
    accounts,
    history,
    holdings: buildHoldings(positions, latestBy(byKind.get('assets')!.rows, 'AssetID'), asOf),
    activity: buildActivity(byKind.get('activity')!.rows, tracked),
    sources: Object.fromEntries([...byKind].map(([k, v]) => [k, v.fileName])) as Record<ExportKind, string>,
  };
}
