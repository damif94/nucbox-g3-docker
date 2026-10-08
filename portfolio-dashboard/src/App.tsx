import { useCallback, useEffect, useRef, useState } from 'react';
import { SettingsProvider, useSettings } from './settings';
import type { Dataset, ExportKind } from './lib/types';
import type { ParsedExport } from './lib/csv';
import { normalize } from './lib/normalize';
import { loadStored, saveStored, type ExportSet, type Stored } from './lib/store';
import { enrichWithFigi } from './lib/figi';
import { AuthError, getSession, logout } from './lib/session';
import { Header } from './components/Header';
import { Upload } from './components/Upload';
import { Login } from './components/Login';
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

const build = (all: ExportSet) => normalize(Object.values(all) as ParsedExport[]);

function Dashboard() {
  const { t, lang } = useSettings();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [figiState, setFigiState] = useState<FigiState>('idle');
  const [open, setOpen] = useState<string | null>(null);
  const enriched = useRef<Dataset | null>(null);
  // the set on the server (the fallback for any kind not re-uploaded)
  const [stored, setStored] = useState<Stored | null>(null);
  const [booting, setBooting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // undefined while the session is being checked, null when signed out
  const [user, setUser] = useState<string | null | undefined>(undefined);

  const show = useCallback((d: Dataset) => {
    enriched.current = null;
    setDs(d);
    setOpen(null);
    setFigiState('idle');
    setUploading(false);
  }, []);

  // Drops everything loaded for the previous session, back to the sign-in screen.
  const signedOut = useCallback(() => {
    enriched.current = null;
    setDs(null);
    setStored(null);
    setOpen(null);
    setFigiState('idle');
    setUploading(false);
    setNotice(null);
    setBooting(false);
    setUser(null);
  }, []);

  const loadData = useCallback(async () => {
    setBooting(true);
    try {
      const s = await loadStored();
      if (s) {
        setStored(s);
        show(build(s.files));
      }
    } catch (e) {
      if (e instanceof AuthError) return signedOut();
      setNotice(t.errLoadStored(String((e as Error).message)));
    }
    setBooting(false);
  }, [show, signedOut, t]);

  useEffect(() => {
    getSession()
      .then((u) => {
        setUser(u);
        if (u) loadData();
        else setBooting(false);
      })
      .catch(() => signedOut());
  }, []); // once, at startup

  // Builds the dashboard right away; the server copy is written in the background.
  const openSet = useCallback(
    (all: ExportSet, changed: ExportKind[]): string | null => {
      let d: Dataset;
      try {
        d = build(all);
      } catch (e) {
        return String((e as Error).message);
      }
      setNotice(null);
      show(d);
      saveStored(all, changed)
        .then(setStored)
        .catch((e) => (e instanceof AuthError ? signedOut() : setNotice(t.errSave(String((e as Error).message)))));
      return null;
    },
    [show, signedOut, t],
  );

  const signOut = useCallback(async () => {
    await logout();
    signedOut();
  }, [signedOut]);

  const enrich = useCallback(async (base: Dataset) => {
    setFigiState('loading');
    try {
      const m = await enrichWithFigi(base.holdings);
      setDs((cur) => (cur && cur.asOf === base.asOf ? { ...cur, holdings: cur.holdings.map((h) => ({ ...h, figi: m.get(h.key) ?? null })) } : cur));
      setFigiState('done');
    } catch (e) {
      if (e instanceof AuthError) signedOut();
      else setFigiState('error');
    }
  }, [signedOut]);

  useEffect(() => {
    if (ds && figiState === 'idle' && enriched.current?.asOf !== ds.asOf) {
      enriched.current = ds; // StrictMode runs effects twice; look up once per dataset
      enrich(ds);
    }
  }, [ds, figiState, enrich]);

  if (user === null) {
    return (
      <>
        <Header />
        <Login
          onSignedIn={(u) => {
            setUser(u);
            loadData();
          }}
        />
      </>
    );
  }
  if (user === undefined || booting) {
    return (
      <>
        <Header />
        <main className="upload">
          <p className="lead">{t.loadingStored}</p>
        </main>
      </>
    );
  }
  if (!ds || uploading) {
    return (
      <>
        <Header user={user} onSignOut={signOut} />
        <Upload
          stored={stored?.files ?? null}
          notice={notice}
          onOpen={openSet}
          onBack={ds ? () => setUploading(false) : undefined}
        />
      </>
    );
  }
  const holding = open ? ds.holdings.find((h) => h.key === open) : null;
  return (
    <>
      <Header ds={ds} user={user} onSignOut={signOut} onReset={() => setUploading(true)} />
      <main className="dash">
        {notice && <p className="status-note" role="status">{notice}</p>}
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
          {stored && (
            <p>
              {t.savedAt} {new Date(stored.savedAt).toLocaleString(lang, { dateStyle: 'long', timeStyle: 'short' })}
            </p>
          )}
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
