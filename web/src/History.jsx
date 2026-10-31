import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDay, monthTitle, useT } from './i18n.js';

const shiftMonth = (m, n) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

// 내역: 날짜별 "이름 N명"과 총인원, 아래에 그 달 사람별 합계
export default function History({ user }) {
  const t = useT();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback((m) => api(`/history${m ? `?month=${m}` : ''}`).then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function remove(d, p) {
    if (!window.confirm(t('confirmRemovePerson', { d: fmtDay(d.date, t.lang), name: p.name, n: p.count }))) return;
    try {
      await api(`/admin/days/${d.date}/people/${p.id}`, { method: 'DELETE' });
      await load(data.month);
    } catch (e) { setErr(e.message); }
  }

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;
  return (
    <div className="stack">
      <div className="monthbar">
        <button onClick={() => load(shiftMonth(data.month, -1))} aria-label={t('prevMonth')}>‹</button>
        <h2>{t('historyTitle')} · {monthTitle(data.month, t.lang)}</h2>
        <button onClick={() => load(shiftMonth(data.month, 1))} aria-label={t('nextMonth')}>›</button>
      </div>
      {!data.days.length ? <p className="muted center">{t('noBookings')}</p> : (
        <>
          <div className="xscroll">
            <table className="grid hist">
              <thead><tr><th>{t('colDate')}</th><th>{t('colPeople')}</th><th className="num">{t('colTotal')}</th></tr></thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className={d.date < data.today ? 'past' : d.date === data.today ? 'today' : ''}>
                    <td className="date">{fmtDay(d.date, t.lang)}</td>
                    <td>{d.people.map((p) => (
                      <span key={p.id} className="chip">{p.name} <b>{t('peopleLong', { n: p.count })}</b>
                        {user?.isAdmin && <button className="chip-x" aria-label={t('remove')} onClick={() => remove(d, p)}>✕</button>}
                      </span>
                    ))}</td>
                    <td className="num"><b className="big-num">{d.total}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={2}>{t('monthTotal', { n: data.total })}</th><td className="num"><b>{data.total}</b></td></tr></tfoot>
            </table>
          </div>
          <section className="card">
            <h3>{t('personTotals')}</h3>
            <ul className="list">
              {data.totals.map((p) => <li key={p.name} className="row between"><span>{p.name}</span><b>{t('mealTimes', { n: p.count })}</b></li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
