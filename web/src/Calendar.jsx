import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDay, monthTitle, useT, weekdayNames, weekdayOf } from './i18n.js';
import DayPanel from './DayPanel.jsx';
import MyDay from './MyDay.jsx';

const shiftMonth = (m, n) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const myCount = (d) => (d.mine ? 1 : 0) + (d.myGuests || 0);

export default function Calendar({ user, summary, onChange }) {
  const t = useT();
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [quick, setQuick] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback((m) => api(`/calendar${m ? `?month=${m}` : ''}`)
    .then((r) => { setData(r); setMonth(r.month); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // 흰색(신청 가능) 날짜를 누를 때마다 내 인원 +1. 다른 날은 안내만 보여 준다.
  async function tap(d) {
    setQuick(d.date);
    setMsg(null);
    if (!d.mealDay || d.phase !== 'open') return;
    try {
      await api(`/days/${d.date}/tap`, { method: 'POST' });
      await load(month);
      onChange();
    } catch (e) { setMsg(e.message); }
  }

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;

  const lead = weekdayOf(data.days[0].date);
  const cells = [...Array(lead).fill(null), ...data.days];
  const q = quick && data.days.find((d) => d.date === quick);
  const closedText = (d) => (!d.mealDay ? `${t('noLunch')}${d.note ? ` (${d.note})` : ''}`
    : d.phase === 'confirmed' || d.phase === 'today' ? t('closedDay', { d: fmtDay(d.deadline, t.lang), h: summary?.deadlineHour ?? 17 })
      : t('pastDay'));

  return (
    <div className={q ? 'with-quickbar' : ''}>
      <div className="deadline-note">⏰ {t('deadlineNotice')}</div>
      <p className="small muted center tap-hint">👆 {t('tapHint')}</p>
      <div className="monthbar">
        <button onClick={() => load(shiftMonth(month, -1))} aria-label={t('prevMonth')}>‹</button>
        <h2>{monthTitle(month, t.lang)}</h2>
        <button onClick={() => load(shiftMonth(month, 1))} aria-label={t('nextMonth')}>›</button>
      </div>
      <div className="cal">
        {weekdayNames(t.lang).map((w) => <div key={w} className="wd">{w}</div>)}
        {cells.map((d, i) => d ? (
          <button
            key={d.date}
            className={['day', d.mealDay ? d.phase : 'off', d.mealDay && myCount(d) ? 'mine' : '', d.date === data.today ? 'today' : '', d.date === quick ? 'picked' : ''].join(' ')}
            onClick={() => tap(d)}
          >
            <span className="num">{Number(d.date.slice(8))}</span>
            {d.mealDay ? (
              <>
                <span className="count">{d.total}<small>{t.lang === 'ko' ? '명' : ''}</small></span>
                {myCount(d) > 0 && <span className="me">✓{myCount(d)}</span>}
              </>
            ) : <span className="note">{d.note || ''}</span>}
          </button>
        ) : <div key={`b${i}`} />)}
      </div>
      <div className="legend small">
        <span><i className="sw open" />{t('legendOpen')}</span>
        <span><i className="sw confirmed" />{t('legendClosed')}</span>
        <span><i className="sw mine" />{t('legendMine')}</span>
      </div>
      <p className="small muted center">{t('tzNote')}</p>
      {q && (
        <div className="quickbar">
          <div className="row between">
            <b>{fmtDay(q.date, t.lang)}{q.mealDay ? ` · ${t('total')} ${t('peopleLong', { n: q.total })}` : ''}</b>
            <span className="row gap">
              {q.mealDay && <button className="link small" onClick={() => setOpen(q.date)}>{t('details')}</button>}
              <button className="x" onClick={() => setQuick(null)} aria-label={t('close')}>✕</button>
            </span>
          </div>
          {q.mealDay && q.phase === 'open'
            ? <MyDay date={q.date} count={myCount(q)} onDone={async () => { setMsg(null); await load(month); onChange(); }} />
            : <p className="small muted">{closedText(q)}{myCount(q) ? ` · ${t('myCount')} ${t('peopleLong', { n: myCount(q) })}` : ''}</p>}
          {msg && <p className="err small">{msg}</p>}
        </div>
      )}
      {open && (
        <DayPanel
          date={open} user={user} summary={summary}
          onClose={() => setOpen(null)}
          onChange={() => { load(month); onChange(); }}
        />
      )}
    </div>
  );
}
