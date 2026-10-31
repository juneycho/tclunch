import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { deadlineParts, fmtDay, useT } from './i18n.js';
import MyDay from './MyDay.jsx';

// 신청자별 인원 (본인 포함 여부는 구분하지 않는다)
function people(d) {
  const map = new Map(d.roster.map((r) => [r.id, { id: r.id, name: r.name, count: 1, signedUp: true, entries: [] }]));
  for (const g of d.guestEntries) {
    const p = map.get(g.hostId) || { id: g.hostId, name: g.host, count: 0, signedUp: false, entries: [] };
    p.count += g.count;
    p.entries.push(g.id);
    map.set(g.hostId, p);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function DayPanel({ date, user, summary, onClose, onChange }) {
  const t = useT();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/days/${date}`).then(setD).catch((e) => setMsg({ ok: false, text: e.message })), [date]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, okText) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      onChange();
      if (okText) setMsg({ ok: true, text: okText });
      return true;
    } catch (e) { setMsg({ ok: false, text: e.message }); return false; } finally { setBusy(false); }
  }

  const day = fmtDay(date, t.lang);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('dayLunch', { d: day })}>
        <div className="sheet-head">
          <h2>{t('dayLunch', { d: day })}</h2>
          <button className="x" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        {!d ? <p className="muted">{t('loading')}</p> : !d.mealDay ? (
          <p className="muted">{t('noLunch')}{d.note ? ` (${d.note})` : ''}.</p>
        ) : (
          <>
            <div className="row gap wrap">
              <span className={`badge ${d.phase}`}>{t(`phase_${d.phase}`)}</span>
              {d.phase === 'open' && <span className="small muted">{t('closesAt', deadlineParts(d, t.lang, summary?.deadlineHour))}</span>}
            </div>
            <div className="stats one">
              <div><b>{d.total}</b><span>{t('total')}</span></div>
            </div>
            {d.phase === 'open' && (
              <div className="card"><MyDay date={date} count={(d.mine ? 1 : 0) + (d.myGuests || 0)} onDone={async () => { await load(); onChange(); }} /></div>
            )}
            {user.isMember && d.phase === 'confirmed' && (
              <p className="small muted">{d.mine ? `${t('signedUpClosed')} ` : ''}{t('closedChange')}</p>
            )}
            {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}

            <h3>{t('byPerson')}</h3>
            <ul className="roster">
              {people(d).map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <b>{t('peopleLong', { n: p.count })}</b>
                  {user.isAdmin && (
                    <button className="link small" disabled={busy}
                      onClick={() => window.confirm(t('confirmRemoveSignup', { name: p.name })) && act(() => api(`/admin/days/${date}/people/${p.id}`, { method: 'DELETE' }))}>{t('remove')}</button>
                  )}
                </li>
              ))}
              {!d.total && <li className="muted">{t('nobodyYet')}</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
