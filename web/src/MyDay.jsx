import React, { useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';

// 내 예약 한 줄: 예약/취소 + 손님 −/+1. 달력 아래 작은 칸과 날짜 상세 창에서 같이 쓴다.
export default function MyDay({ date, mine, myGuests, isMember, onDone }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function act(fn) {
    setBusy(true);
    setErr(null);
    try { await fn(); await onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="myday">
      <div className="row between gap">
        {isMember && (mine
          ? <span className="ok strong">{t('reserved')}</span>
          : <span className="muted">{t('notReserved')}</span>)}
        <div className="stepper small-stepper">
          <span>{t('guestCount')}</span>
          <button disabled={busy || !myGuests} onClick={() => act(() => api(`/days/${date}/guests/one`, { method: 'DELETE' }))} aria-label={t('fewer')}>−</button>
          <b>{myGuests || 0}</b>
          <button disabled={busy} onClick={() => act(() => api(`/days/${date}/guests`, { method: 'POST', body: { count: 1 } }))} aria-label={t('more')}>+1</button>
        </div>
      </div>
      {isMember && (mine
        ? <button className="danger full" disabled={busy} onClick={() => act(() => api(`/days/${date}/signup`, { method: 'DELETE' }))}>{t('cancelReserve')}</button>
        : <button className="primary full" disabled={busy} onClick={() => act(() => api(`/days/${date}/signup`, { method: 'PUT' }))}>{t('reserve')}</button>)}
      {err && <p className="err small">{err}</p>}
    </div>
  );
}
