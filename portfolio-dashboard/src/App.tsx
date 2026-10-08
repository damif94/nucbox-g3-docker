import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsProvider, useSettings } from './settings';
import type { Dataset, ExportKind } from './lib/types';
import { normalize } from './lib/normalize';
import { addUpload, deleteUpload, loadLibrary, type Upload } from './lib/library';
import { KINDS, merge, type Merged } from './lib/merge';
import { coverage, type Coverage } from './lib/coverage';
import { PERIODS, periodView, type Period } from './lib/analytics';
import { enrichWithFigi } from './lib/figi';
import { AuthError, getSession, logout } from './lib/session';
import { Header } from './components/Header';
import { DataManager, type Pending } from './components/DataManager';
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

interface Library {
  uploads: Upload[];
  merged: Merged;
  cov: Coverage | null;
}

function Dashboard() {
  const { t } = useSettings();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [lib, setLib] = useState<Library | null>(null);
  const [figiState, setFigiState] = useState<FigiState>('idle');
  const [open, setOpen] = useState<string | null>(null);
  const enriched = useRef<Dataset | null>(null);
  const [booting, setBooting] = useState(true);
  const [showData, setShowData] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  // undefined while the session is being checked, null when signed out
  const [user, setUser] = useState<string | null | undefined>(undefined);

  // Drops everything loaded for the previous session, back to the sign-in screen.
  const signedOut = useCallback(() => {
    enriched.current = null;
    setDs(null);
    setLib(null);
    setOpen(null);
    setFigiState('idle');
    setShowData(false);
    setNotice(null);
    setBooting(false);
    setUser(null);
  }, []);

  const fail = useCallback(
    (e: unknown, msg: (m: string) => string) => (e instanceof AuthError ? signedOut() : setNotice(msg(String((e as Error).message)))),
    [signedOut],
  );

  /** Re-reads the library from the server and rebuilds everything derived from it. */
  const reload = useCallback(async (): Promise<Dataset | null> => {
    const uploads = await loadLibrary();
    const merged = merge(uploads);
    const cov = merged.rows.positions || merged.rows.activity ? coverage(merged) : null;
    setLib({ uploads, merged, cov });
    let next: Dataset | null = null;
    if (merged.rows.positions) {
      try {
        next = normalize(merged.rows, merged.sources);
      } catch (e) {
        setNotice(t.errLoadStored(String((e as Error).message)));
      }
    }
    enriched.current = null;
    setDs(next);
    setFigiState('idle');
    setOpen(null);
    return next;
  }, [t]);

  const start = useCallback(async () => {
    setBooting(true);
    try {
      const d = await reload();
      setShowData(!d);
    } catch (e) {
      fail(e, t.errLoadStored);
      setShowData(true);
    }
    setBooting(false);
  }, [reload, fail, t]);

  useEffect(() => {
    getSession()
      .then((u) => {
        setUser(u);
        if (u) start();
        else setBooting(false);
      })
      .catch(() => signedOut());
  }, []); // once, at startup

  const save = useCallback(
    async (files: Pending[]) => {
      setNotice(null);
      for (const f of files) {
        try {
          await addUpload(f.parsed!, f.sha!, user ?? null);
        } catch (e) {
          fail(e, (m) => t.errSaveUpload(f.fileName, m));
          break;
        }
      }
      await reload().catch((e) => fail(e, t.errLoadStored));
    },
    [reload, fail, user, t],
  );

  const remove = useCallback(
    async (u: Upload) => {
      try {
        await deleteUpload(u.id);
        await reload();
      } catch (e) {
        fail(e, t.errLoadStored);
      }
    },
    [reload, fail, t],
  );

  const openData = useCallback(async () => {
    setShowData(true);
    setNotice(null);
    // others may have uploaded since: show the library as it is now
    await reload().catch((e) => fail(e, t.errLoadStored));
  }, [reload, fail, t]);

  const signOut = useCallback(async () => {
    await logout();
    signedOut();
  }, [signedOut]);

  const enrich = useCallback(
    async (base: Dataset) => {
      setFigiState('loading');
      try {
        const m = await enrichWithFigi(base.holdings);
        setDs((cur) => (cur && cur.asOf === base.asOf ? { ...cur, holdings: cur.holdings.map((h) => ({ ...h, figi: m.get(h.key) ?? null })) } : cur));
        setFigiState('done');
      } catch (e) {
        if (e instanceof AuthError) signedOut();
        else setFigiState('error');
      }
    },
    [signedOut],
  );

  useEffect(() => {
    if (ds && figiState === 'idle' && enriched.current?.asOf !== ds.asOf) {
      enriched.current = ds; // StrictMode runs effects twice; look up once per dataset
      enrich(ds);
    }
  }, [ds, figiState, enrich]);

  // KPIs, the chart and "change this period" follow the selected period; the rest is as of the last day
  const view = useMemo(() => (ds ? periodView(ds, period) : null), [ds, period]);
  const periods = useMemo(() => (ds ? PERIODS.filter((p) => p === 'all' || periodView(ds, p).first > ds.first) : []), [ds]);

  if (user === null) {
    return (
      <>
        <Header />
        <Login
          onSignedIn={(u) => {
            setUser(u);
            start();
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
  if (!ds || !view || showData) {
    return (
      <>
        <Header user={user} onSignOut={signOut} />
        <DataManager
          uploads={lib?.uploads ?? []}
          merged={lib?.merged ?? merge([])}
          cov={lib?.cov ?? null}
          notice={notice}
          onSave={save}
          onDelete={remove}
          onOpen={ds ? () => setShowData(false) : undefined}
        />
      </>
    );
  }
  const holding = open ? ds.holdings.find((h) => h.key === open) : null;
  const sources = KINDS.filter((k) => ds.sources[k]?.length).map((k: ExportKind) => {
    const names = ds.sources[k]!;
    return `${t.upKinds[k]}: ${names.length === 1 ? names[0] : t.nFiles(names.length)}`;
  });
  return (
    <>
      <Header ds={ds} user={user} onSignOut={signOut} onReset={openData} />
      <main className="dash">
        {notice && <p className="status-note" role="status">{notice}</p>}
        {periods.length > 1 && (
          <div className="period-bar">
            <span className="muted small">{t.periods.label}</span>
            <div className="seg" role="group" aria-label={t.periods.label}>
              {periods.map((p) => (
                <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {t.periods[p]}
                </button>
              ))}
            </div>
          </div>
        )}
        <Kpis ds={view} />
        <Alerts ds={ds} />
        <div className="grid">
          <ValueChart ds={view} />
          <ChangeSummary full={ds} from={view.first} to={view.asOf} cov={lib?.cov ?? null} />
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
          <p>{t.footer.source}: {sources.join(' · ')}</p>
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
