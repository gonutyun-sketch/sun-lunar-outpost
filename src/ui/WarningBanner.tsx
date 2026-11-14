import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import type { Key } from '../i18n/translate';

export interface MissionWarning {
  id: string;
  tone: 'caution' | 'critical';
  title: Key;
  action: Key;
}

export function useWarningQueue() {
  const [queue, setQueue] = useState<MissionWarning[]>([]);
  const warning = queue[0];
  const add = useCallback((...messages: MissionWarning[]) => {
    if (messages.length) setQueue((pending) => [...pending, ...messages]);
  }, []);
  const clear = useCallback(() => setQueue([]), []);

  useEffect(() => {
    if (!warning) return;
    const timer = window.setTimeout(() => {
      setQueue((pending) => pending[0] === warning ? pending.slice(1) : pending);
    }, 2300);
    return () => window.clearTimeout(timer);
  }, [warning]);

  return { warning, add, clear };
}

export function WarningBanner({ warning }: { warning?: MissionWarning }) {
  const { t } = useI18n();
  return (
    <div className="mission-warning-region" aria-live="assertive" aria-atomic="true">
      {warning && (
        <div key={warning.id} data-warning={warning.id} className={`mission-warning ${warning.tone}`}>
          <svg viewBox="0 0 20 20" width="24" height="24" shapeRendering="crispEdges" aria-hidden>
            <path fill="currentColor" d="M8 1h4v3h2v4h2v4h2v3h2v4H0v-4h2v-3h2V8h2V4h2z" />
            <path fill="#1c1724" d="M9 6h2v6H9zm0 8h2v2H9z" />
          </svg>
          <div><strong>{t(warning.title)}</strong><span>{t(warning.action)}</span></div>
        </div>
      )}
    </div>
  );
}
