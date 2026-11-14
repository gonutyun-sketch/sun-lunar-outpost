import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LANG, makeT, type Key, type Lang, type Params, type T } from './translate';

const STORAGE_KEY = 'sun-lang';

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'ko' ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** Renders **bold** segments of a translated string as <b>. */
export function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  /** Translate and render **bold** markup. */
  tr: (key: Key, params?: Params) => ReactNode;
}

const Ctx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18nValue>(() => {
    const t = makeT(lang);
    return {
      lang,
      t,
      tr: (k, p) => rich(t(k, p)),
      setLang: (l) => {
        setLangState(l);
        try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
      },
    };
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}

/** 한국어 / English switch. Changing language never touches game state. */
export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label={t('lang.label')}>
      {(['ko', 'en'] as Lang[]).map((l) => (
        <button key={l} type="button" className={lang === l ? 'active' : ''} aria-pressed={lang === l}
          title={t(l === 'ko' ? 'lang.tipKo' : 'lang.tipEn')} onClick={() => setLang(l)}>
          {t(l === 'ko' ? 'lang.ko' : 'lang.en')}
        </button>
      ))}
    </div>
  );
}
