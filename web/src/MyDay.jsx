import React, { useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';

// 내 신청 인원: − / + (+는 날짜를 한 번 더 누른 것과 같다)
export default function MyDay({ date, count, onDone }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function act(path) {
    setBusy(true);
    setErr(null);
    try { await api(`/days/${date}/${path}`, { method: 'POST' }); await onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="myday">
      <div className="row between">
        <span>{t('myCount')}</span>
        <div className="stepper">
          <button disabled={busy || !count} onClick={() => act('untap')} aria-label={t('fewer')}>−</button>
          <b className="big-num">{t('peopleLong', { n: count })}</b>
          <button disabled={busy} onClick={() => act('tap')} aria-label={t('more')}>+</button>
        </div>
      </div>
      {err && <p className="err small">{err}</p>}
    </div>
  );
}
