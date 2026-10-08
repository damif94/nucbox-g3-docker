import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsProvider, useSettings } from './settings';
import type { Dataset, ExportKind } from './lib/types';
import { normalize } from './lib/normalize';
import { addUpload, deleteUpload, loadLibrary, type Upload } from './lib/library';
import { KINDS, merge, type Merged } from './lib/merge';
import { coverage, type Coverage } from './lib/coverage';
import { PERIODS, periodView, rangeView, type Period } from './lib/analytics';
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
  const { t, fmt } = useSettings();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [lib, setLib] = useState<Library | null>(null);
  const [figiState, setFigiState] = useState<FigiState>('idle');
  const [open, setOpen] = useState<string | null>(null);
  const enriched = useRef<Dataset | null>(null);
  const [booting, setBooting] = useState(true);
  const [showData, setShowData] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period | 'custom'>('all');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
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

  // The chart and "change this period" follow the selected period. A custom range snaps each end
  // to the closest earlier Positions snapshot; with fewer than two snapshots it falls back to all.
  const customView = useMemo(() => (ds && custom ? rangeView(ds, custom.from, custom.to) : null), [ds, custom]);
  const view = useMemo(() => (!ds ? null : period === 'custom' ? customView ?? ds : periodView(ds, period)), [ds, period, customView]);
  // the KPI tiles always show the latest day; their change is measured from the period's start
  const kpiView = useMemo(() => (ds && view ? rangeView(ds, view.first, ds.asOf) ?? ds : null), [ds, view]);

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
        <div className="period-bar">
          <span className="muted small">{t.periods.label}</span>
          <div className="seg" role="group" aria-label={t.periods.label}>
            {[...PERIODS, 'custom' as const].map((p) => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => {
                  // custom starts from whatever is on screen, so it can be adjusted from there
                  if (p === 'custom' && !custom) setCustom({ from: view.first, to: view.asOf });
                  setPeriod(p);
                }}
              >
                {t.periods[p]}
              </button>
            ))}
          </div>
          {period === 'custom' && custom && (
            <div className="range-pick">
              <label>
                <span>{t.chFrom}</span>
                <input type="date" value={custom.from} min={ds.first} max={ds.asOf} required onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
              </label>
              <label>
                <span>{t.chTo}</span>
                <input type="date" value={custom.to} min={ds.first} max={ds.asOf} required onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
              </label>
            </div>
          )}
        </div>
        {period === 'custom' && custom && !customView && <p className="note warn period-note" role="alert">⚠ {t.chRangeInvalid}</p>}
        {period === 'custom' && custom && customView && (customView.first !== custom.from || customView.asOf !== custom.to) && (
          <p className="note period-note">{t.chSnapped(fmt.date(customView.first, 'long'), fmt.date(customView.asOf, 'long'))}</p>
        )}
        <Kpis ds={kpiView!} />
        <Alerts ds={ds} />
        <div className="grid">
          <ValueChart ds={view} />
          <ChangeSummary ds={view} cov={lib?.cov ?? null} />
          <Allocation ds={ds} />
          <Issuers ds={ds} />
          <Countries ds={ds} />
          <Holdings ds={ds} figiState={figiState} onOpen={setOpen} onRetry={() => enrich(ds)} />
          <FixedIncome ds={ds} />
          <Events ds={ds} onOpen={setOpen} />
          <Activity ds={view} />
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
