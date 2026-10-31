import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { monthTitle, useT, weekdayNames, weekdayOf } from './i18n.js';

const shiftMonth = (m, n) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const MARK = { A: '●', N: '✕', S: '○' };

// 종합판: 월별 사용자별 식사 횟수 (출석표 모양)
export default function Summary() {
  const t = useT();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback((m) => api(`/monthly${m ? `?month=${m}` : ''}`).then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;
  const wd = weekdayNames(t.lang);
  const dayTotal = (d) => data.rows.reduce((a, r) => a + (r.cells[d] && r.cells[d] !== 'N' ? 1 : 0), 0) + (data.guests[d] || 0);

  return (
    <div className="stack">
      <div className="monthbar">
        <button onClick={() => load(shiftMonth(data.month, -1))} aria-label={t('prevMonth')}>‹</button>
        <h2>{t('summaryTitle')} · {monthTitle(data.month, t.lang)}</h2>
        <button onClick={() => load(shiftMonth(data.month, 1))} aria-label={t('nextMonth')}>›</button>
      </div>
      <p className="small muted center">{t('summaryLegend')}</p>
      {!data.rows.length ? <p className="muted">{t('noData')}</p> : (
        <div className="xscroll">
          <table className="grid att">
            <thead>
              <tr>
                <th className="sticky">{t('colName')}</th>
                <th className="tot">{t('colMeals')}</th>
                <th className="tot">{t('colNoShows')}</th>
                {data.days.map((d) => (
                  <th key={d} className={weekdayOf(d) === 6 ? 'sat' : weekdayOf(d) === 0 ? 'sun' : ''}>
                    {Number(d.slice(8))}<small>{wd[weekdayOf(d)]}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <th className="sticky">{r.name}</th>
                  <td className="tot"><b>{r.meals}</b></td>
                  <td className={`tot${r.noShows ? ' err' : ''}`}>{r.noShows || ''}</td>
                  {data.days.map((d) => <td key={d} className={`c${r.cells[d] || ''}`}>{MARK[r.cells[d]] || ''}</td>)}
                </tr>
              ))}
              <tr className="guestrow">
                <th className="sticky">{t('guestRow')}</th>
                <td className="tot"><b>{Object.values(data.guests).reduce((a, n) => a + Number(n), 0)}</b></td>
                <td className="tot" />
                {data.days.map((d) => <td key={d}>{data.guests[d] || ''}</td>)}
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th className="sticky">{t('colTotal')}</th>
                <td className="tot"><b>{data.days.reduce((a, d) => a + dayTotal(d), 0)}</b></td>
                <td className="tot" />
                {data.days.map((d) => <td key={d}>{dayTotal(d) || ''}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
