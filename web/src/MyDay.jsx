import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';

// 내 신청 인원: −/+로 정하고 '확인'을 눌러야 저장된다 (0명으로 확인하면 취소)
export default function MyDay({ date, count, onDone }) {
  const t = useT();
  const [n, setN] = useState(count || 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  useEffect(() => { setN(count || 1); }, [date, count]);
  useEffect(() => { setErr(null); setDone(null); }, [date]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/days/${date}/count`, { method: 'PUT', body: { count: n } });
      await onDone();
      setDone(n ? t('savedCount', { n }) : t('didCancel'));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="myday">
      <div className="row between">
        <span>{t('myCount')}{count ? <small className="muted"> ({t('nowCount', { n: count })})</small> : null}</span>
        <div className="stepper">
          <button disabled={busy || n <= 0} onClick={() => setN(n - 1)} aria-label={t('fewer')}>−</button>
          <b className="big-num">{t('peopleLong', { n })}</b>
          <button disabled={busy} onClick={() => setN(n + 1)} aria-label={t('more')}>+</button>
        </div>
      </div>
      <button className={n === 0 ? 'danger full' : 'primary full'} disabled={busy || n === count} onClick={save}>
        {n === 0 ? t('cancelReserve') : t('ok')}
      </button>
      {done && <p className="ok small">{done}</p>}
      {err && <p className="err small">{err}</p>}
    </div>
  );
}
