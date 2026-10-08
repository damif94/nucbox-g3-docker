import { useEffect, useRef, type ReactNode } from 'react';
import { useSettings } from '../settings';
import type { Dataset, Holding } from '../lib/types';
import { noteUnderlyings, optionShares, parentIssuer, unrealized } from '../lib/analytics';
import { figiUrl } from '../lib/figi';
import { Delta, useHoldingName } from './ui';
import { Term } from './Term';
import type { TermKey } from '../i18n/glossary';

type Field = [label: ReactNode, value: ReactNode | null | undefined];

function Fields({ rows }: { rows: Field[] }) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && v !== false);
  if (!shown.length) return null;
  return (
    <dl className="fields">
      {shown.map(([l, v], i) => (
        <div key={i}>
          <dt>{l}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HoldingDrawer({ ds, holding: h, onClose }: { ds: Dataset; holding: Holding; onClose: () => void }) {
  const { t, fmt, lang } = useSettings();
  const name = useHoldingName();
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const L = (k: TermKey, label: string) => <Term k={k}>{label}</Term>;
  const pctPx = h.bucket === 'bonds' || h.bucket === 'structured';
  const px = (v: number | null) => (v == null ? null : pctPx ? `${fmt.num(v, 3)}%` : fmt.usd(v, 2));
  const u = unrealized(h);
  const kindTerm: TermKey | null =
    h.bucket === 'bonds' ? 'bond' : h.bucket === 'equity' ? 'etf' : h.bucket === 'options' ? 'coveredCall' : h.ref.structuredType === 'CLN' ? 'cln' : h.bucket === 'structured' ? 'eln' : null;

  const what = (() => {
    const issuer = parentIssuer(h);
    const maturity = fmt.date(h.maturity, 'long');
    const price = h.price ? `${fmt.num(h.price, 2)}%` : '—';
    switch (h.bucket) {
      case 'bonds':
        return t.what.bond({ issuer, coupon: `${fmt.num(h.rate ?? 0, 3)}%`, freq: t.freq[h.ref.couponFreq ?? 'Oth'] ?? '', maturity, price, perpetual: h.ref.maturityType === 'PERP/CALL' });
      case 'structured':
        return h.ref.structuredType === 'CLN'
          ? t.what.cln({ issuer, coupon: `${fmt.num(h.rate ?? 0, 2)}%`, maturity, price })
          : t.what.eln({ issuer, und: noteUnderlyings(h).join(', ') || '—', maturity, price });
      case 'equity':
        return t.what.etf({ name: h.figi?.name ?? h.ref.issuer ?? h.description, focus: t.focus[h.ref.fundFocus ?? ''] ?? h.ref.fundFocus ?? '' });
      case 'options':
        return h.option
          ? t.what.option({
              n: Math.abs(h.quantity),
              right: h.option.right,
              sold: h.quantity < 0,
              und: h.option.underlying,
              strike: fmt.usd(h.option.strike, 2),
              expiry: fmt.date(h.option.expiry, 'long'),
              shares: optionShares(h),
            })
          : h.description;
      case 'credit':
        return t.what.credit;
      default:
        return t.what.cash;
    }
  })();

  const F = t.f;
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <p className="eyebrow">{t.bucket[h.bucket]}{h.ref.structuredType ? ` · ${h.ref.structuredType}` : ''}</p>
            <h2 id="drawer-title">{name(h)}</h2>
            <p className="muted small">{h.description}</p>
          </div>
          <button ref={closeBtn} className="btn icon" onClick={onClose} aria-label={t.dClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>

        <section className="what">
          <h3>{kindTerm ? <Term k={kindTerm}>{t.dWhat}</Term> : t.dWhat}</h3>
          <p>{what}</p>
          {h.option?.adjusted && <p className="note warn">⚠ {t.adjusted}</p>}
          {/REG ?S/.test(h.description) && <p className="note"><Term k="regS">Reg S</Term></p>}
        </section>

        <section>
          <h3>{t.dPosition}</h3>
          <Fields
            rows={[
              [L('face', F.qty), h.bucket === 'cash' ? null : fmt.num(h.quantity, 2)],
              [L('tradeSettle', F.settledQty), h.settledQuantity !== h.quantity ? fmt.num(h.settledQuantity, 2) : null],
              [L('avgCost', F.avgCost), px(h.avgCost)],
              [L('pricePct', F.price), px(h.price)],
              [F.priceDate, h.priceDate && fmt.date(h.priceDate, 'long')],
              [L('marketValue', F.mv), fmt.usd(h.marketValue, 2)],
              [L('tradeSettle', F.mvTrade), h.marketValueTrade !== h.marketValue ? fmt.usd(h.marketValueTrade, 2) : null],
              [L('accrued', F.accrued), h.accrued ? fmt.usd(h.accrued, 2) : null],
              [L('costBasis', F.cost), h.costBasis != null ? fmt.usd(h.costBasis, 2) : null],
              [L('unrealized', F.unrealized), u != null ? <Delta value={u}>{fmt.signedUsd(u, 2)} ({fmt.signedPct(u / Math.abs(h.costBasis!), 2)})</Delta> : null],
            ]}
          />
        </section>

        <section>
          <h3>{t.dTerms}</h3>
          <Fields
            rows={[
              [F.issuer, h.ref.issuer],
              [F.issueDate, h.ref.issueDate && fmt.date(h.ref.issueDate, 'long')],
              [L('maturity', F.maturity), h.ref.maturityType === 'PERP/CALL' ? <Term k="perpetual" /> : h.maturity && fmt.date(h.maturity, 'long')],
              [F.maturityType, h.ref.maturityType],
              [L('coupon', F.coupon), h.rate ? `${fmt.num(h.rate, 3)}%` : null],
              [F.couponFreq, h.ref.couponFreq && h.rate ? t.freq[h.ref.couponFreq] ?? h.ref.couponFreq : null],
              [F.nextCoupon, h.nextCouponDate && `${fmt.date(h.nextCouponDate, 'long')}${h.nextCouponAmount ? ` · ${fmt.usd(h.nextCouponAmount, 2)}` : ''}`],
              [L('callable', F.nextCall), h.ref.nextCall && `${fmt.date(h.ref.nextCall, 'long')}${h.ref.nextCallPrice ? ` @ ${fmt.num(h.ref.nextCallPrice, 0)}` : ''}`],
              [F.callFeature, h.ref.callFeature],
              [L('ytw', F.ytw), h.ytw ? `${fmt.num(h.ytw, 3)}%` : null],
              [L('ytm', F.ytm), h.ytm && h.ytm !== h.ytw ? `${fmt.num(h.ytm, 3)}%` : null],
              [L('duration', F.duration), h.duration ? fmt.num(h.duration, 2) : null],
              [L('rating', F.ratingSP), h.ref.ratingSP],
              [L('rating', F.ratingBbg), h.ref.ratingBbg],
              [F.sector, h.ref.sector],
              [F.industry, [h.ref.industry, h.ref.subIndustry].filter((x) => x && x !== 'Other').join(' · ') || null],
              [L('countryRisk', F.countryRisk), h.ref.countryRisk && fmt.country(h.ref.countryRisk)],
              [F.countryIssue, h.ref.countryIssue && h.ref.countryIssue !== h.ref.countryRisk ? fmt.country(h.ref.countryIssue) : null],
              [L('paymentRank', F.paymentRank), h.ref.paymentRank && h.ref.paymentRank !== '99' ? h.ref.paymentRank : null],
              [L('eln', F.structuredType), h.ref.structuredType],
              [L('strike', F.strike), h.option && fmt.usd(h.option.strike, 2)],
              [L('expiry', F.expiry), h.option && fmt.date(h.option.expiry, 'long')],
              [F.underlying, h.option?.underlying ?? (noteUnderlyings(h).join(', ') || null)],
              [F.divYield, h.ref.dividendYield ? `${fmt.num(h.ref.dividendYield, 2)}%` : null],
            ]}
          />
        </section>

        <section>
          <h3>{t.dIds}</h3>
          <Fields
            rows={[
              [L('isin', 'ISIN'), h.isin && <code>{h.isin}</code>],
              [L('cusip', 'CUSIP'), h.cusip && <code>{h.cusip}</code>],
              [L('sedol', 'SEDOL'), h.sedol && <code>{h.sedol}</code>],
              [F.commonCode, h.commonCode && <code>{h.commonCode}</code>],
              [L('bankId', F.bankId), h.secId && <code>{h.secId}</code>],
              [L('entity', 'Entity'), `${h.entity} · ${t.entities[h.entity] ?? ''}`],
              [t.thAccount, <code key="a">{h.account}</code>],
            ]}
          />
        </section>

        {h.bucket !== 'cash' && h.bucket !== 'credit' && (
          <section className="figi">
            <h3><Term k="figi">{t.dFigi}</Term></h3>
            {h.figi === undefined ? (
              <p className="muted small"><span className="spinner" aria-hidden="true" /> {t.figiLoading}</p>
            ) : h.figi === null ? (
              <p className="muted small">{t.dFigiNone}</p>
            ) : (
              <>
                <Fields
                  rows={[
                    [F.ticker, h.figi.ticker],
                    [F.name, h.figi.name],
                    [F.securityType, [h.figi.securityType, h.figi.securityType2].filter(Boolean).join(' · ')],
                    [F.marketSector, h.figi.marketSector],
                    [F.exch, h.figi.exchCode],
                    [L('figi', F.figi), <code key="f">{h.figi.figi}</code>],
                    [L('compositeFigi', F.compositeFigi), h.figi.compositeFIGI && <code>{h.figi.compositeFIGI}</code>],
                    [F.shareClassFigi, h.figi.shareClassFIGI && <code>{h.figi.shareClassFIGI}</code>],
                  ]}
                />
                <p className="small">
                  {h.figi.venues > 1 && <span className="muted">{t.dVenues(h.figi.venues)} · </span>}
                  <a href={figiUrl(h.figi.compositeFIGI ?? h.figi.figi)} target="_blank" rel="noreferrer" lang={lang}>
                    {t.dOpenFigi} ↗
                  </a>
                </p>
              </>
            )}
          </section>
        )}
        <p className="fine">{ds.sources.assets}</p>
      </aside>
    </div>
  );
}
