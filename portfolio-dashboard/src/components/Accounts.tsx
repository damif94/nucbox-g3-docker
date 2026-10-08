import { useSettings } from '../settings';
import type { Account, Dataset } from '../lib/types';
import { Panel } from './ui';
import { Term } from './Term';
import type { TermKey } from '../i18n/glossary';

const purpose = (a: Account): { key: 'checking' | 'custody' | 'margin'; term: TermKey } =>
  a.lines.some((l) => l.assetClass === 'DDA') ? { key: 'checking', term: 'dda' } : a.description === 'Margin' ? { key: 'margin', term: 'margin' } : { key: 'custody', term: 'custody' };

export function Accounts({ ds }: { ds: Dataset }) {
  const { t, fmt } = useSettings();
  const credit = ds.holdings.find((h) => h.bucket === 'credit');
  const rateChanges = ds.activity.filter((x) => x.kind === 'rate_change').map((x) => fmt.date(x.date));
  return (
    <Panel title={t.secAccounts} className="span-12">
      <div className="accounts">
        {ds.accounts.map((a) => {
          const p = purpose(a);
          const value = ds.holdings.filter((h) => h.account === a.number).reduce((s, h) => s + h.marketValue, 0);
          return (
            <article key={a.number} className="account">
              <header>
                <span className="mono acc-no">{a.number}</span>
                <span className="status"><span aria-hidden="true">●</span> {a.status}</span>
              </header>
              <h3><Term k={p.term}>{t.accPurpose[p.key]}</Term></h3>
              <div className="acc-value">{fmt.usd(value, 2)}</div>
              <dl className="fields compact">
                <div><dt><Term k="entity">{a.entity}</Term></dt><dd>{t.entities[a.entity] ?? a.entity}</dd></div>
                <div><dt>{t.accOpened}</dt><dd>{fmt.date(a.opened, 'long')}</dd></div>
                <div><dt>{t.accHolds}</dt><dd>{[...new Set(a.lines.map((l) => l.assetClass))].join(' · ')}</dd></div>
                <div><dt>{t.accType}</dt><dd>{a.type} · {a.currency}</dd></div>
              </dl>
              {credit && credit.account === a.number && (
                <div className="credit">
                  <h4><Term k="creditLine">{t.accCredit}</Term></h4>
                  <dl className="fields compact">
                    <div><dt>{t.accCreditBalance}</dt><dd>{fmt.usd(credit.marketValue, 2)}</dd></div>
                    <div><dt>{t.accCreditMaturity}</dt><dd>{fmt.date(credit.maturity, 'long')}</dd></div>
                  </dl>
                  {rateChanges.length > 0 && <p className="note">{t.accCreditNote.replace('{dates}', rateChanges.join(', '))}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
