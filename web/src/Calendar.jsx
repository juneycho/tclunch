import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { monthTitle, useT, weekdayNames, weekdayOf } from './i18n.js';
import DayPanel from './DayPanel.jsx';

const shiftMonth = (m, n) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export default function Calendar({ user, summary, onChange }) {
  const t = useT();
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback((m) => {
    api(`/calendar${m ? `?month=${m}` : ''}`).then((r) => { setData(r); setMonth(r.month); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;

  const lead = weekdayOf(data.days[0].date);
  const cells = [...Array(lead).fill(null), ...data.days];

  return (
    <div>
      <div className="deadline-note">⏰ {t('deadlineNotice')}</div>
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
            className={['day', d.mealDay ? d.phase : 'off', d.mealDay && d.mine ? 'mine' : '', d.date === data.today ? 'today' : ''].join(' ')}
            onClick={() => setOpen(d.date)}
          >
            <span className="num">{Number(d.date.slice(8))}</span>
            {d.mealDay ? (
              <>
                <span className="count">{d.total}<small>{t.lang === 'ko' ? '명' : ''}</small></span>
                {(d.mine || d.myGuests > 0) && <span className="me">{d.mine ? '✓' : ''}{d.myGuests ? `+${d.myGuests}` : ''}</span>}
                {d.menu && <span className="menu">{d.menu.title}</span>}
              </>
            ) : <span className="note">{d.note || ''}</span>}
          </button>
        ) : <div key={`b${i}`} />)}
      </div>
      <div className="legend small">
        <span><i className="sw open" />{t('legendOpen')}</span>
        <span><i className="sw confirmed" />{t('legendConfirmed')}</span>
        <span><i className="sw mine" />{t('legendMine')}</span>
      </div>
      <p className="small muted center">{t('tzNote')}</p>
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
