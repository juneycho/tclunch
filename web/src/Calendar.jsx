import React, { useCallback, useEffect, useState } from 'react';
import { addDays, api, fmtDay, weekdayOf } from './api.js';
import DayPanel from './DayPanel.jsx';

const shiftMonth = (m, n) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export default function Calendar({ user, summary, onChange }) {
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback((m) => {
    api(`/calendar${m ? `?month=${m}` : ''}`).then((r) => { setData(r); setMonth(r.month); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="muted">불러오는 중…</p>;

  const lead = weekdayOf(data.days[0].date);
  const cells = [...Array(lead).fill(null), ...data.days];
  const firstOpen = addDays(data.today, summary?.deadlineDays ?? 7);

  return (
    <div>
      {summary?.noShows?.last90 >= summary?.noShowThreshold && (
        <div className="notice warn">최근 90일 노쇼가 {summary.noShows.last90}회예요. 신청하신 날은 꼭 드시거나 마감 전에 취소해 주세요.</div>
      )}
      <div className="monthbar">
        <button onClick={() => load(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
        <h2>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</h2>
        <button onClick={() => load(shiftMonth(month, 1))} aria-label="다음 달">›</button>
      </div>
      <p className="small muted center">
        식사일 {summary?.deadlineDays ?? 7}일 전 23:59에 마감돼요.
        {user.isMember ? ` 지금은 ${fmtDay(firstOpen)}부터 신청할 수 있어요.` : ''}
      </p>
      <div className="cal">
        {['일', '월', '화', '수', '목', '금', '토'].map((w) => <div key={w} className="wd">{w}</div>)}
        {cells.map((d, i) => d ? (
          <button
            key={d.date}
            className={['day', d.mealDay ? d.phase : 'off', d.mealDay && d.mine ? 'mine' : '', d.date === data.today ? 'today' : ''].join(' ')}
            onClick={() => setOpen(d.date)}
          >
            <span className="num">{Number(d.date.slice(8))}</span>
            {d.mealDay ? (
              <>
                <span className="count">{d.total}<small>명</small></span>
                {d.mine && <span className="me">✓{d.mine.guests ? `+${d.mine.guests}` : ''}</span>}
                {d.menu && <span className="menu">{d.menu.title}</span>}
              </>
            ) : <span className="note">{d.note || ''}</span>}
          </button>
        ) : <div key={`b${i}`} />)}
      </div>
      <div className="legend small">
        <span><i className="sw open" />신청 가능</span>
        <span><i className="sw confirmed" />인원 확정</span>
        <span><i className="sw mine" />내가 신청</span>
      </div>
      {open && (
        <DayPanel
          date={open} user={user}
          onClose={() => setOpen(null)}
          onChange={() => { load(month); onChange(); }}
        />
      )}
    </div>
  );
}
