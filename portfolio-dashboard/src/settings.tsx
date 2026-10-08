import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STRINGS, type Lang, type Strings } from './i18n/strings';
import { GLOSSARY, type TermKey } from './i18n/glossary';
import { makeFormat, type Fmt } from './lib/format';

export type Theme = 'light' | 'dark';

interface Settings {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: Strings;
  fmt: Fmt;
  term: (k: TermKey) => { term: string; def: string };
}

const Ctx = createContext<Settings | null>(null);

const load = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* per-device convenience only */
  }
};

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (load('pd.lang') as Lang) || (navigator.language?.startsWith('en') ? 'en' : 'es'));
  const [theme, setThemeState] = useState<Theme>(() => (load('pd.theme') as Theme) || systemTheme());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<Settings>(
    () => ({
      lang,
      theme,
      setLang: (l) => {
        save('pd.lang', l);
        setLangState(l);
      },
      setTheme: (th) => {
        save('pd.theme', th);
        document.documentElement.dataset.theme = th;
        setThemeState(th);
      },
      t: STRINGS[lang],
      fmt: makeFormat(lang),
      term: (k) => GLOSSARY[k][lang],
    }),
    [lang, theme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSettings = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSettings outside provider');
  return s;
};
