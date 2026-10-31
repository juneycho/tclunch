import React, { useCallback, useEffect, useState } from 'react';
import { addDays, api, mondayOf, vnToday } from './api.js';
import { fmtDay, money, useT } from './i18n.js';
import DayPanel from './DayPanel.jsx';

// 요리사 참조용 시트: 날짜별 참석자·총인원·예산. 모두 볼 수 있고, 메뉴는 요리사·관리자만 고친다.
export default function Sheet({ user, summary, onChange }) {
  const t = useT();
  const [from, setFrom] = useState(() => mondayOf(vnToday()));
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => api(`/sheet?from=${from}&days=14`).then(setData).catch((e) => setErr(e.message)), [from]);
  useEffect(() => { load(); }, [load]);

  const price = data?.mealPrice ?? summary?.mealPrice ?? 150000;
  const canEdit = user.isCook || user.isAdmin;
  const sum = (k) => (data?.days || []).reduce((a, d) => a + d[k], 0);

  return (
    <div className="stack">
      <div className="guide">
        <p>💰 {t('sheetGuide1', { price: money(price), p2: money(price * 2), p10: money(price * 10) })}</p>
        <p>👩‍🍳 {t('sheetGuide2')}</p>
      </div>
      <div className="monthbar">
        <button onClick={() => setFrom(addDays(from, -7))} aria-label={t('prevWeek')}>‹</button>
        <h2 className="small-h">{fmtDay(from, t.lang)} – {fmtDay(addDays(from, 13), t.lang)}</h2>
        <button onClick={() => setFrom(addDays(from, 7))} aria-label={t('nextWeek')}>›</button>
      </div>
      {from !== mondayOf(vnToday()) && <button className="link center-btn" onClick={() => setFrom(mondayOf(vnToday()))}>{t('thisWeek')}</button>}
      {err && <p className="err">{err}</p>}
      {!data ? <p className="muted">{t('loading')}</p> : !data.days.length ? <p className="muted">{t('noMealDays')}</p> : (
        <div className="xscroll">
          <table className="grid sheet-grid">
            <thead>
              <tr><th>{t('colDate')}</th><th>{t('colPeople')}</th><th className="num">{t('colTotal')} / {t('colBudget')}</th></tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <SheetRow key={d.date} d={d} canEdit={canEdit} onOpen={() => setOpen(d.date)} onSaved={() => { load(); onChange(); }} />
              ))}
            </tbody>
            <tfoot>
              <tr><th>{t('weekTotal')}</th><td /><td className="num"><b className="big-num">{sum('total')}</b><div>{money(sum('budget'))}</div></td></tr>
            </tfoot>
          </table>
        </div>
      )}
      {canEdit && <Expenses user={user} onChange={onChange} />}
      {open && <DayPanel date={open} user={user} summary={summary} onClose={() => setOpen(null)} onChange={load} />}
    </div>
  );
}

function SheetRow({ d, canEdit, onOpen, onSaved }) {
  const t = useT();
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(d.menu?.title || '');
  const [desc, setDesc] = useState(d.menu?.description || '');
  const [err, setErr] = useState(null);
  async function holiday() {
    if (!window.confirm(t('confirmHoliday', { d: fmtDay(d.date, t.lang) }))) return;
    try {
      await api(`/admin/days/${d.date}`, { method: 'PUT', body: { closed: true, note: t('holidayNote') } });
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  async function save() {
    try {
      await api(`/days/${d.date}/menu`, { method: 'PUT', body: { title, description: desc } });
      setEdit(false);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <tr className={d.phase}>
      <td className="date">
        <button className="link strong" onClick={onOpen}>{fmtDay(d.date, t.lang)}</button>
        <span className={`badge ${d.phase}`}>{t(`phase_${d.phase}`)}</span>
        {canEdit && d.phase !== 'past' && <button className="link small holiday-btn" onClick={holiday}>{t('makeClosed')}</button>}
      </td>
      <td>
        <div className="names">{d.names.length ? d.names.join(', ') : <span className="muted">—</span>}</div>
        {d.guestList.map((g) => (
          <div key={g.id} className="small guestline">+ {t('guestsShort', { n: g.count })}{g.note ? ` (${g.note})` : ''} · {t('addedBy', { name: g.host })}</div>
        ))}
        <div className="menu-line">
          {err && !edit && <p className="err">{err}</p>}
          {edit ? (
            <div className="form">
              <input placeholder={t('menuPlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
              <textarea placeholder={t('descPlaceholder')} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} rows={2} />
              {err && <p className="err">{err}</p>}
              <div className="row gap"><button className="primary" onClick={save}>{t('save')}</button><button className="link" onClick={() => setEdit(false)}>{t('cancel')}</button></div>
            </div>
          ) : (
            <>
              {d.menu ? <b>🍽 {d.menu.title}</b> : <span className="muted small">{t('menuTbd')}</span>}
              {canEdit && <button className="link small" onClick={() => setEdit(true)}>{d.menu ? t('edit') : t('setMenu')}</button>}
            </>
          )}
        </div>
      </td>
      <td className="num">
        <b className="big-num">{d.total}</b>
        <div className="small muted">{t('staffShort', { n: d.members })} · {t('guestsShort', { n: d.guests })}</div>
        <div className="small budget-cell">{money(d.budget)}</div>
      </td>
    </tr>
  );
}

function Expenses({ user, onChange }) {
  const t = useT();
  const [list, setList] = useState([]);
  const [f, setF] = useState({ date: vnToday(), amount: '', memo: '' });
  const [err, setErr] = useState(null);
  const load = useCallback(() => api('/expenses').then((r) => setList(r.expenses)), []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setErr(null);
    try {
      await api('/expenses', { method: 'POST', body: { ...f, amount: Number(String(f.amount).replace(/[^\d]/g, '')) } });
      setF({ ...f, amount: '', memo: '' });
      load();
      onChange();
    } catch (e2) { setErr(e2.message); }
  }
  async function del(x) {
    if (!window.confirm(t('confirmDeleteExpense', { d: x.date, v: money(x.amount) }))) return;
    await api(`/expenses/${x.id}`, { method: 'DELETE' }).catch((e) => setErr(e.message));
    load();
    onChange();
  }
  return (
    <section className="card">
      <h3>{t('expensesTitle')}</h3>
      <form className="row gap wrap" onSubmit={add}>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        <input inputMode="numeric" placeholder={`${t('amount')} (VND)`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <input placeholder={t('memoPlaceholder')} value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} maxLength={100} className="grow" />
        <button className="primary">{t('add')}</button>
      </form>
      {err && <p className="err">{err}</p>}
      <ul className="list">
        {list.map((x) => (
          <li key={x.id} className="row between">
            <span>{x.date} · {x.memo || t('expense')} <small className="muted">{x.createdBy}</small></span>
            <span>{money(x.amount)} {(user.isAdmin || x.createdBy === user.name) && <button className="link small" onClick={() => del(x)}>{t('remove')}</button>}</span>
          </li>
        ))}
        {!list.length && <li className="muted">{t('noExpenses')}</li>}
      </ul>
    </section>
  );
}
