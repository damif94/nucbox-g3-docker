// Outbound links to a public price chart, chosen per asset type. Built from the
// identifiers alone — nothing is fetched; the ISIN/ticker only leaves the browser on click.
import type { Holding } from './types';
import { noteUnderlyings } from './analytics';

export interface PriceLink {
  symbol: string; // what the chart shows (ticker, contract or ISIN)
  source: string;
  url: string;
}

const TICKER = /^[A-Z]{1,5}$/;

/** Yahoo needs no exchange prefix, unlike TradingView (OpenFIGI only gives the US composite). */
const yahoo = (t: string): PriceLink => ({ symbol: t, source: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/` });

/** OPRA symbol as TradingView spells it: GLD270115C370.0 */
function opraSymbol(o: NonNullable<Holding['option']>): string {
  const [y, m, d] = o.expiry.split('-');
  const strike = Number.isInteger(o.strike) ? o.strike.toFixed(1) : String(o.strike);
  return `${o.underlying}${y.slice(2)}${m}${d}${o.right}${strike}`;
}

/**
 * - ETFs/stocks: Yahoo by ticker.
 * - Options: the contract on TradingView, plus the underlying. A contract adjusted by a
 *   corporate action gets a different OCC root, so only the underlying is linked.
 * - Bonds: Börse Frankfurt by ISIN (quotes in % of face, like the bank).
 * - Structured notes don't trade publicly: their underlyings instead. CLNs track a
 *   credit, which has no free public chart, so they get nothing.
 */
export function priceLinks(h: Holding): PriceLink[] {
  switch (h.bucket) {
    case 'equity': {
      const t = h.ref.ticker ?? h.figi?.ticker;
      return t ? [yahoo(t)] : [];
    }
    case 'options': {
      if (!h.option) return [];
      const und = yahoo(h.option.underlying);
      if (h.option.adjusted) return [und];
      const s = opraSymbol(h.option);
      return [{ symbol: s, source: 'TradingView', url: `https://www.tradingview.com/symbols/OPRA-${s}/` }, und];
    }
    case 'bonds':
      return h.isin ? [{ symbol: h.isin, source: 'Börse Frankfurt', url: `https://www.boerse-frankfurt.de/bond/${h.isin}` }] : [];
    case 'structured':
      if (h.ref.structuredType === 'CLN') return [];
      return noteUnderlyings(h).filter((t) => TICKER.test(t)).map(yahoo);
    default:
      return [];
  }
}
