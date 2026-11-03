import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';

// 내 신청: 본인 1명만. 신청 안 한 날은 '확인'으로 신청, 신청한 날은 '취소'로 취소
export default function MyDay({ date, count, onDone }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  useEffect(() => { setErr(null); setDone(null); }, [date]);

  async function save(to) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/days/${date}/count`, { method: 'PUT', body: { count: to } });
      await onDone();
      setDone(to ? t('savedCount', { n: to }) : t('didCancel'));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="myday">
      <p className="small">{count ? t('simpleBooked', { n: count }) : t('simpleAsk')}</p>
      {count
        ? <button className="danger full" disabled={busy} onClick={() => save(0)}>{t('cancelReserve')}</button>
        : <button className="primary full" disabled={busy} onClick={() => save(1)}>{t('ok')}</button>}
      {done && <p className="ok small">{done}</p>}
      {err && <p className="err small">{err}</p>}
    </div>
  );
}
