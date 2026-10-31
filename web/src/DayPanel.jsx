import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDay, useT } from './i18n.js';
import MyDay from './MyDay.jsx';

// 사람별 인원: 본인 신청 1 + 그 사람이 추가한 손님
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
              {d.phase === 'open' && <span className="small muted">{t('closesAt', { d: fmtDay(d.deadline, t.lang), h: summary?.deadlineHour ?? 17 })}</span>}
            </div>
            <div className="stats">
              <div><b>{d.total}</b><span>{t('total')}</span></div>
              <div><b>{d.members}</b><span>{t('staff')}</span></div>
              <div><b>{d.guests}</b><span>{t('guests')}</span></div>
            </div>
            {d.phase === 'open' && (
              <div className="card"><MyDay date={date} count={(d.mine ? 1 : 0) + (d.myGuests || 0)} onDone={async () => { await load(); onChange(); }} /></div>
            )}
            {user.isMember && d.phase === 'confirmed' && (
              <p className="small muted">{d.mine ? `${t('signedUpClosed')} ` : ''}{t('closedChange')}</p>
            )}
            {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}

            <h3>{t('attendees', { n: d.total })}</h3>
            <ul className="roster">
              {people(d).map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <b>{t('peopleLong', { n: p.count })}</b>
                  {user.isAdmin && (
                    <button className="link small" disabled={busy}
                      onClick={() => window.confirm(t('confirmRemoveSignup', { name: p.name })) && act(async () => {
                        if (p.signedUp) await api(`/admin/days/${date}/signup/${p.id}`, { method: 'PUT', body: { remove: true } });
                        for (const g of p.entries) await api(`/guests/${g}`, { method: 'DELETE' });
                      })}>{t('remove')}</button>
                  )}
                </li>
              ))}
              {!d.total && <li className="muted">{t('nobodyYet')}</li>}
            </ul>
            {user.isAdmin && <AdminAdd date={date} roster={d.roster} act={act} />}
          </>
        )}
        {(user.isAdmin || user.isCook) && d && <DayOverride date={date} d={d} act={act} />}
      </div>
    </div>
  );
}

function AdminAdd({ date, roster, act }) {
  const t = useT();
  const [users, setUsers] = useState([]);
  const [pick, setPick] = useState('');
  useEffect(() => { api('/admin/users').then((r) => setUsers(r.users.filter((u) => u.status === 'active' && u.isMember))); }, []);
  const avail = users.filter((u) => !roster.some((r) => r.id === u.id));
  if (!avail.length) return null;
  return (
    <details className="admin-box">
      <summary>{t('adminAddSignup')}</summary>
      <div className="row gap">
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{t('pickStaff')}</option>
          {avail.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button disabled={!pick} onClick={() => act(() => api(`/admin/days/${date}/signup/${pick}`, { method: 'PUT', body: { guests: 0 } }), t('added'))}>{t('add')}</button>
      </div>
    </details>
  );
}

function DayOverride({ date, d, act }) {
  const t = useT();
  const [note, setNote] = useState(d.note || t('holidayNote'));
  return (
    <details className="admin-box">
      <summary>{t('adminDay')}</summary>
      <input placeholder={t('dayNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={30} />
      <div className="row gap">
        {d.mealDay
          ? <button onClick={() => window.confirm(t('confirmHoliday', { d: fmtDay(date, t.lang) })) &&
              act(() => api(`/admin/days/${date}`, { method: 'PUT', body: { closed: true, note } }), t('saved'))}>{t('makeClosed')}</button>
          : <button onClick={() => act(() => api(`/admin/days/${date}`, { method: 'PUT', body: { closed: false, note } }), t('saved'))}>{t('makeOpen')}</button>}
        <button className="link" onClick={() => act(() => api(`/admin/days/${date}`, { method: 'PUT', body: { reset: true } }), t('saved'))}>{t('resetDefault')}</button>
      </div>
    </details>
  );
}
