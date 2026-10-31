import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';

export default function Admin({ user, onChange }) {
  const t = useT();
  const [sec, setSec] = useState('users');
  return (
    <div className="stack">
      <nav className="subtabs">
        {[['users', 'adminUsers'], ['settings', 'adminSettings'], ['audit', 'adminAudit']].map(([k, l]) => (
          <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{t(l)}</button>
        ))}
      </nav>
      {sec === 'users' && <Users me={user} />}
      {sec === 'settings' && <><Notice /><Settings /></>}
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
          <div className="tr th"><span>{t('colName')}</span><span>{t('colEats')}</span><span>{t('colAdmin')}</span><span>{t('colStatus')}</span><span /></div>
          {rest.map((u) => (
            <div key={u.id} className={`tr ${u.status}`}>
              <span><button className="link name-btn" title={t('rename')} onClick={() => { const n = window.prompt(t('renamePrompt'), u.name); if (n && n.trim() && n.trim() !== u.name) patch(u, { name: n.trim() }); }}>{u.name} ✎</button></span>
              <span><input type="checkbox" checked={u.isMember} onChange={(e) => patch(u, { isMember: e.target.checked })} aria-label={t('colEats')} /></span>
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

function Notice() {
  const t = useT();
  const [text, setText] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api('/notice').then((r) => setText(r.text || '')); }, []);
  if (text === null) return null;
  async function save(e) {
    e.preventDefault();
    try {
      await api('/admin/notice', { method: 'PUT', body: { text } });
      setMsg({ ok: true, text: t('saved') });
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }
  return (
    <form className="card form" onSubmit={save}>
      <h3>{t('noticeTitle')}</h3>
      <p className="small muted">{t('noticeHint')}</p>
      <textarea rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      <button className="primary">{t('save')}</button>
    </form>
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
    ['max_guests', 'setMaxGuests', 'unitPeople'],
  ];
  async function save(e) {
    e.preventDefault();
    try {
      const body = Object.fromEntries(fields.map(([k]) => [k, Number(s[k])]));
      body.max_guests = Math.max(Number(shown(s, 'max_guests')) - 1, 0);
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
          <span className="row gap"><input type="number" value={shown(s, k)} onChange={(e) => setS({ ...s, [k]: e.target.value, ...(k === 'max_guests' ? { maxPeople: e.target.value } : {}) })} className={k === 'meal_price' ? '' : 'short'} />{unit && t(unit)}</span>
        </label>
      ))}
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      <button className="primary">{t('save')}</button>
    </form>
  );
}

// 화면에는 '한 사람 최대 인원'(= 본인 1 + 손님 한도)으로 보여 준다
function shown(s, k) {
  if (k !== 'max_guests') return s[k] ?? '';
  return s.maxPeople ?? (s.max_guests == null ? '' : Number(s.max_guests) + 1);
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
