export type Bucket = 'cash' | 'credit' | 'bonds' | 'structured' | 'equity' | 'options';

export interface AccountLine {
  category: string; // AssetCategory: Cash | Credit | Security | Derivative
  assetClass: string; // DDA | Loan | Bonds | ...
  opened: string | null;
}

export interface Account {
  number: string;
  entity: string; // SNB | SSL
  description: string | null; // "Cash" | "Margin" | ""
  type: string;
  status: string;
  currency: string;
  opened: string | null;
  lines: AccountLine[];
}

export interface DayValue {
  date: string;
  total: number; // Σ MarketValueUSD - Settled (canonical NAV, ties to the PDF statement)
  totalTrade: number; // Σ MarketValueUSD - Trade
  byBucket: Partial<Record<Bucket, number>>;
}

/** Instrument reference data from Assets_Securities (latest BusinessDate per AssetID). */
export interface InstrumentRef {
  ticker: string | null;
  issuer: string | null;
  issueDate: string | null;
  maturityType: string | null;
  countryRisk: string | null;
  countryIssue: string | null;
  coupon: number | null;
  couponFreq: string | null; // CPN_FREQ: Qty | SAn | Mty | Oth
  nextCall: string | null;
  callFeature: string | null;
  nextCallPrice: number | null;
  ratingSP: string | null;
  ratingMoody: string | null;
  ratingBbg: string | null;
  sector: string | null;
  industry: string | null;
  subIndustry: string | null;
  paymentRank: string | null;
  structuredType: string | null; // ELN | CLN
  dividendYield: number | null;
  fundFocus: string | null;
  marketSector: string | null;
  underlyingSecId: string | null;
}

export interface FigiInfo {
  figi: string;
  compositeFIGI: string | null;
  shareClassFIGI: string | null;
  ticker: string | null;
  name: string | null;
  securityType: string | null;
  securityType2: string | null;
  marketSector: string | null;
  exchCode: string | null;
  securityDescription: string | null;
  venues: number; // listings returned for this identifier
}

export interface OptionTerms {
  right: 'C' | 'P';
  underlying: string; // ticker
  expiry: string; // YYYY-MM-DD
  strike: number;
  adjusted: boolean; // contract adjusted by a corporate action (e.g. split)
}

export interface Holding {
  key: string; // account:assetId
  assetId: string;
  account: string;
  entity: string;
  category: string;
  assetClass: string;
  bucket: Bucket;
  subType: string | null;
  description: string;
  isin: string | null;
  cusip: string | null;
  sedol: string | null;
  secId: string | null; // bank internal id (BPSA / SecID)
  commonCode: string | null;
  quantity: number;
  settledQuantity: number;
  avgCost: number | null;
  price: number | null;
  priceDate: string | null;
  marketValue: number; // settled basis, includes accrued interest
  marketValueTrade: number;
  accrued: number;
  costBasis: number | null; // in USD, sign follows quantity (short options are negative)
  rate: number | null;
  ytw: number | null;
  ytm: number | null;
  ytc: number | null;
  duration: number | null;
  maturity: string | null;
  nextCouponDate: string | null;
  nextCouponAmount: number | null;
  option: OptionTerms | null;
  ref: InstrumentRef;
  figi?: FigiInfo | null; // undefined = not looked up yet, null = not found
}

export type TxnKind =
  | 'deposit'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'coupon'
  | 'redemption'
  | 'purchase'
  | 'fee'
  | 'rate_change'
  | 'buy'
  | 'cancel_buy'
  | 'dividend'
  | 'contra'
  | 'other';

export interface Txn {
  id: number;
  businessDate: string;
  date: string; // best economic date for display
  account: string;
  entity: string;
  assetClass: string;
  banking: boolean;
  code: string | null; // raw code shown next to the inferred label
  kind: TxnKind;
  external: boolean; // moves money in/out of the tracked accounts
  description: string;
  isin: string | null;
  secId: string | null;
  quantity: number | null;
  price: number | null;
  cashEffect: number | null; // + in / − out of client cash; null when another leg carries it
  taxWithheld: number | null;
  tradeDate: string | null;
  settleDate: string | null;
}

export interface Dataset {
  cif: string;
  asOf: string;
  first: string;
  accounts: Account[];
  history: DayValue[];
  holdings: Holding[]; // as of `asOf`
  activity: Txn[];
  /** file names each export kind was merged from */
  sources: Partial<Record<ExportKind, string[]>>;
}

export type ExportKind = 'accounts' | 'activity' | 'positions' | 'assets';
