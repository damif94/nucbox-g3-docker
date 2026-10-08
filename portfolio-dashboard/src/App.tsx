import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsProvider, useSettings } from './settings';
import type { Dataset } from './lib/types';
import { enrichWithFigi } from './lib/figi';
import { Header } from './components/Header';
import { Upload } from './components/Upload';
import { Alerts, Kpis } from './components/Overview';
import { ValueChart } from './components/ValueChart';
import { ChangeSummary } from './components/ChangeSummary';
import { Allocation, Countries, Issuers } from './components/Exposure';
import { Holdings } from './components/Holdings';
import { HoldingDrawer } from './components/HoldingDrawer';
import { Events, FixedIncome } from './components/FixedIncome';
import { Activity } from './components/Activity';
import { Accounts } from './components/Accounts';

type FigiState = 'idle' | 'loading' | 'done' | 'error';

function Dashboard() {
  const { t } = useSettings();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [figiState, setFigiState] = useState<FigiState>('idle');
  const [open, setOpen] = useState<string | null>(null);
  const enriched = useRef<Dataset | null>(null);

  const enrich = useCallback(async (base: Dataset) => {
    setFigiState('loading');
    try {
      const m = await enrichWithFigi(base.holdings);
      setDs((cur) => (cur && cur.asOf === base.asOf ? { ...cur, holdings: cur.holdings.map((h) => ({ ...h, figi: m.get(h.key) ?? null })) } : cur));
      setFigiState('done');
    } catch {
      setFigiState('error');
    }
  }, []);

  useEffect(() => {
    if (ds && figiState === 'idle' && enriched.current?.asOf !== ds.asOf) {
      enriched.current = ds; // StrictMode runs effects twice; look up once per dataset
      enrich(ds);
    }
  }, [ds, figiState, enrich]);

  if (!ds) {
    return (
      <>
        <Header />
        <Upload onLoaded={(d) => { setDs(d); setFigiState('idle'); }} />
      </>
    );
  }
  const holding = open ? ds.holdings.find((h) => h.key === open) : null;
  return (
    <>
      <Header ds={ds} onReset={() => { enriched.current = null; setDs(null); setOpen(null); setFigiState('idle'); }} />
      <main className="dash">
        <Kpis ds={ds} />
        <Alerts ds={ds} />
        <div className="grid">
          <ValueChart ds={ds} />
          <ChangeSummary ds={ds} />
          <Allocation ds={ds} />
          <Issuers ds={ds} />
          <Countries ds={ds} />
          <Holdings ds={ds} figiState={figiState} onOpen={setOpen} onRetry={() => enrich(ds)} />
          <FixedIncome ds={ds} />
          <Events ds={ds} onOpen={setOpen} />
          <Activity ds={ds} />
          <Accounts ds={ds} />
        </div>
        <footer className="foot">
          <p>{t.footer.source}: {Object.values(ds.sources).join(' · ')}</p>
          <p>{t.footer.figi} {t.footer.privacy}</p>
          <p>{t.footer.disclaimer}</p>
        </footer>
      </main>
      {holding && <HoldingDrawer ds={ds} holding={holding} onClose={() => setOpen(null)} />}
    </>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <Dashboard />
    </SettingsProvider>
  );
}
