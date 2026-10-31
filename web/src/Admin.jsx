import React, { useCallback, useEffect, useState } from 'react';
import { api, vnToday } from './api.js';
import { money, useT } from './i18n.js';

export default function Admin({ user, onChange }) {
  const t = useT();
  const [sec, setSec] = useState('users');
  return (
    <div className="stack">
      <nav className="subtabs">
        {[['users', 'adminUsers'], ['noshow', 'adminNoShows'], ['budget', 'adminBudget'], ['settings', 'adminSettings'], ['audit', 'adminAudit']].map(([k, l]) => (
          <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{t(l)}</button>
        ))}
      </nav>
      {sec === 'users' && <Users me={user} />}
      {sec === 'noshow' && <NoShows />}
      {sec === 'budget' && <Budgets onChange={onChange} />}
      {sec === 'settings' && <Settings />}
      {sec === 'audit' && <Audit />}
    </div>
  );
}

function Users({ me }) {
  const t = useT();
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => api('/admin/users').then((r) => setUsers(r.users)), []);
  useEffect(() => { load(); }, [load]);

  const patch = (u, body) => api(`/admin/users/${u.id}`, { method: 'PATCH', body }).then(load).catch((e) => setMsg({ ok: false, text: e.message }));
  async function reset(u) {
    if (!window.confirm(t('confirmResetPw', { name: u.name }))) return;
    const r = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' }).catch((e) => { setMsg({ ok: false, text: e.message }); return null; });
    if (!r) return;
    setMsg({ ok: true, text: t('tempPwMsg', { name: u.name, pw: r.tempPassword }) });
  }

  const rest = users.filter((u) => u.status !== 'pending');
  return (
    <>
      {msg && <p className={msg.ok ? 'ok notice' : 'err'}>{msg.text}</p>}
      <section className="card">
        <h3>{t('staffCount', { n: rest.filter((u) => u.status === 'active').length })}</h3>
        <p className="small muted">{t('usersHint')}</p>
        <div className="table">
          <div className="tr th"><span>{t('colName')}</span><span>{t('colEats')}</span><span>{t('colCook')}</span><span>{t('colAdmin')}</span><span>{t('colStatus')}</span><span /></div>
          {rest.map((u) => (
            <div key={u.id} className={`tr ${u.status}`}>
              <span>{u.name}</span>
              <span><input type="checkbox" checked={u.isMember} onChange={(e) => patch(u, { isMember: e.target.checked })} aria-label={t('colEats')} /></span>
              <span><input type="checkbox" checked={u.isCook} onChange={(e) => patch(u, { isCook: e.target.checked })} aria-label={t('colCook')} /></span>
              <span><input type="checkbox" checked={u.isAdmin} disabled={u.id === me.id} onChange={(e) => patch(u, { isAdmin: e.target.checked })} aria-label={t('colAdmin')} /></span>
              <span>
                <select value={u.status} disabled={u.id === me.id} onChange={(e) => patch(u, { status: e.target.value })}>
                  <option value="active">{t('active')}</option><option value="inactive">{t('inactive')}</option>
                </select>
              </span>
              <span>{u.isAdmin && u.id !== me.id ? <button className="link small" onClick={() => reset(u)}>{t('resetPw')}</button> : null}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>{t('newStaffTitle')}</h3>
        <p className="small muted">{t('newStaffHint')}</p>
      </section>
    </>
  );
}

function NoShows() {
  const t = useT();
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/admin/noshows').then((r) => setRows(r.rows)); }, []);
  return (
    <section className="card">
      <h3>{t('noShowsTitle')}</h3>
      <p className="small muted">{t('noShowsHint')}</p>
      <div className="table">
        <div className="tr th"><span>{t('colName')}</span><span>{t('colSignups')}</span><span>{t('colNoShows')}</span><span>{t('col90')}</span></div>
        {rows.map((r) => (
          <div key={r.id} className={`tr ${r.status}`}>
            <span>{r.name}</span><span>{r.signups}</span>
            <span className={r.no_shows ? 'err' : ''}>{r.no_shows}</span>
            <span className={r.no_shows_90d ? 'err' : ''}>{r.no_shows_90d}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Budgets({ onChange }) {
  const t = useT();
  const [list, setList] = useState([]);
  const ym = vnToday().slice(0, 7);
  const lastDay = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).toISOString().slice(0, 10);
  const [f, setF] = useState({ startDate: `${ym}-01`, endDate: lastDay(ym), amount: '', note: '' });
  const [err, setErr] = useState(null);
  const load = useCallback(() => api('/admin/budgets').then((r) => setList(r.budgets)), []);
  useEffect(() => { load(); }, [load]);
  async function save(e) {
    e.preventDefault();
    setErr(null);
    try {
      await api('/admin/budgets', { method: 'POST', body: { ...f, amount: Number(String(f.amount).replace(/[^\d]/g, '')) } });
      setF({ ...f, amount: '', note: '', id: undefined });
      load();
      onChange();
    } catch (e2) { setErr(e2.message); }
  }
  return (
    <section className="card">
      <h3>{t('budgetTitle')}</h3>
      <p className="small muted">{t('budgetHint')}</p>
      <form className="row gap wrap" onSubmit={save}>
        <input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required />
        <span>~</span>
        <input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} required />
        <input inputMode="numeric" placeholder={`${t('budgetAmount')} (VND)`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <input placeholder={t('memo')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="primary">{f.id ? t('edit') : t('add')}</button>
      </form>
      {err && <p className="err">{err}</p>}
      <ul className="list">
        {list.map((b) => (
          <li key={b.id} className="row between">
            <span>{b.startDate} ~ {b.endDate} {b.note && <small className="muted">{b.note}</small>}</span>
            <span>{money(b.amount)}{' '}
              <button className="link small" onClick={() => setF({ ...b, amount: String(b.amount), note: b.note || '' })}>{t('edit')}</button>
              <button className="link small" onClick={() => window.confirm(t('confirmDeleteBudget')) && api(`/admin/budgets/${b.id}`, { method: 'DELETE' }).then(load).then(onChange)}>{t('remove')}</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Settings() {
  const t = useT();
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api('/admin/settings').then(setS); }, []);
  if (!s) return null;
  const fields = [
    ['deadline_weekday', 'setDeadlineWeekday', ''],
    ['deadline_hour', 'setDeadlineHour', 'unitHour'],
    ['meal_price', 'setMealPrice', ''],
    ['attendance_close_hour', 'setAttendanceClose', 'unitHour'],
    ['noshow_threshold', 'setNoShowThreshold', 'unitTimes'],
    ['reminder_hour', 'setReminderHour', 'unitHour'],
    ['max_guests', 'setMaxGuests', 'unitPeople'],
  ];
  async function save(e) {
    e.preventDefault();
    try {
      const body = Object.fromEntries(fields.map(([k]) => [k, Number(s[k])]));
      setS(await api('/admin/settings', { method: 'PUT', body }));
      setMsg({ ok: true, text: t('saved') });
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }
  return (
    <form className="card form" onSubmit={save}>
      <h3>{t('settingsTitle')}</h3>
      <p className="small muted">{t('tzNote')}</p>
      {fields.map(([k, label, unit]) => (
        <label key={k}>{t(label)}
          <span className="row gap"><input type="number" value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} className={k === 'meal_price' ? '' : 'short'} />{unit && t(unit)}</span>
        </label>
      ))}
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      <button className="primary">{t('save')}</button>
    </form>
  );
}

function Audit() {
  const t = useT();
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/admin/audit').then((r) => setRows(r.rows)); }, []);
  return (
    <section className="card">
      <h3>{t('auditTitle')}</h3>
      <ul className="list small">
        {rows.map((r) => <li key={r.id}><b>{r.actor}</b> {r.action} <span className="muted">{r.createdAt}</span><br /><code>{r.detail}</code></li>)}
        {!rows.length && <li className="muted">{t('noAudit')}</li>}
      </ul>
    </section>
  );
}
