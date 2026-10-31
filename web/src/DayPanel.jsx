import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDay, useT } from './i18n.js';
import MyDay from './MyDay.jsx';

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
            {d.menu ? (
              <div className="card menu-card"><span className="label">{t('menu')}</span><b>{d.menu.title}</b>{d.menu.description && <p>{d.menu.description}</p>}</div>
            ) : d.phase !== 'open' && <p className="small muted">{t('noMenuYet')}</p>}

            {d.phase === 'open' && (
              <div className="card"><MyDay date={date} mine={!!d.mine} myGuests={d.myGuests} isMember={user.isMember} onDone={async () => { await load(); onChange(); }} /></div>
            )}
            {user.isMember && d.phase === 'confirmed' && (
              <p className="small muted">{d.mine ? `${t('signedUpClosed')} ` : ''}{t('closedChange')}</p>
            )}
            {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}

            <h3>{t('attendees', { n: d.roster.length })}</h3>
            <ul className="roster">
              {d.roster.map((r) => (
                <li key={r.id}>
                  <span>{r.name}</span>
                  {user.isAdmin && (
                    <button className="link small" disabled={busy}
                      onClick={() => window.confirm(t('confirmRemoveSignup', { name: r.name })) &&
                        act(() => api(`/admin/days/${date}/signup/${r.id}`, { method: 'PUT', body: { remove: true } }))}>{t('remove')}</button>
                  )}
                </li>
              ))}
              {!d.roster.length && <li className="muted">{t('nobodyYet')}</li>}
            </ul>

            {d.guestEntries.length > 0 && (
              <>
                <h3>{t('guestsList')} · {t('peopleLong', { n: d.guests })}</h3>
                <ul className="roster">
                  {d.guestEntries.map((g) => (
                    <li key={g.id}>
                      <span>{t('peopleLong', { n: g.count })}{g.note ? ` · ${g.note}` : ''} <small className="muted">{t('addedBy', { name: g.host })}</small></span>
                      {(user.isAdmin || (g.hostId === user.id && d.phase === 'open')) && (
                        <button className="link small" disabled={busy}
                          onClick={() => act(() => api(`/guests/${g.id}`, { method: 'DELETE' }), t('didCancel'))}>{t('remove')}</button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
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
