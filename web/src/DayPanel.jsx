import React, { useCallback, useEffect, useState } from 'react';
import { api, fmtDay, PHASE_LABEL } from './api.js';

export default function DayPanel({ date, user, onClose, onChange }) {
  const [d, setD] = useState(null);
  const [guests, setGuests] = useState(0);
  const [guestNote, setGuestNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/days/${date}`).then((r) => {
    setD(r);
    setGuests(r.mine?.guests ?? 0);
    setGuestNote(r.mine?.guestNote ?? '');
  }).catch((e) => setMsg({ ok: false, text: e.message })), [date]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, okText) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      onChange();
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }

  const canManageAttendance = d && (user.isAdmin || user.isCook) && (d.phase === 'today' || d.phase === 'past');
  const me = d?.roster.find((r) => r.id === user.id);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${fmtDay(date)} 점심`}>
        <div className="sheet-head">
          <h2>{fmtDay(date)} 점심</h2>
          <button className="x" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {!d ? <p className="muted">불러오는 중…</p> : !d.mealDay ? (
          <p className="muted">이날은 점심 운영을 하지 않아요{d.note ? ` (${d.note})` : ''}.</p>
        ) : (
          <>
            <div className="row gap">
              <span className={`badge ${d.phase}`}>{PHASE_LABEL[d.phase]}</span>
              {d.phase === 'open' && <span className="small muted">{fmtDay(d.deadline)} 23:59 마감</span>}
            </div>
            <div className="stats">
              <div><b>{d.total}</b><span>총 인원</span></div>
              <div><b>{d.members}</b><span>직원</span></div>
              <div><b>{d.guests}</b><span>손님</span></div>
            </div>
            {d.menu ? (
              <div className="card menu-card"><span className="label">메뉴</span><b>{d.menu.title}</b>{d.menu.description && <p>{d.menu.description}</p>}</div>
            ) : d.phase !== 'open' && <p className="small muted">요리사가 아직 메뉴를 올리지 않았어요.</p>}

            {user.isMember && d.phase === 'open' && (
              <div className="card">
                <div className="row between">
                  <b>{d.mine ? '신청했어요 ✓' : '신청하기'}</b>
                </div>
                <div className="row between">
                  <span>손님(같이 드실 분)</span>
                  <div className="stepper">
                    <button onClick={() => setGuests(Math.max(0, guests - 1))} aria-label="손님 줄이기">−</button>
                    <span>{guests}명</span>
                    <button onClick={() => setGuests(Math.min(20, guests + 1))} aria-label="손님 늘리기">+</button>
                  </div>
                </div>
                {guests > 0 && <input placeholder="손님 메모 (예: 거래처 2명)" value={guestNote} maxLength={50} onChange={(e) => setGuestNote(e.target.value)} />}
                <div className="row gap">
                  <button className="primary grow" disabled={busy}
                    onClick={() => act(() => api(`/days/${date}/signup`, { method: 'PUT', body: { guests, guestNote } }), d.mine ? '변경했어요.' : '신청했어요.')}>
                    {d.mine ? `변경 저장 (나 + 손님 ${guests}명)` : `신청 (나${guests ? ` + 손님 ${guests}명` : ''})`}
                  </button>
                  {d.mine && (
                    <button className="danger" disabled={busy}
                      onClick={() => act(() => api(`/days/${date}/signup`, { method: 'DELETE' }), '취소했어요.')}>취소</button>
                  )}
                </div>
              </div>
            )}
            {user.isMember && d.phase === 'confirmed' && (
              <p className="small muted">{d.mine ? `신청 완료 (나${d.mine.guests ? ` + 손님 ${d.mine.guests}명` : ''}). ` : ''}마감되어 변경하려면 관리자에게 말해 주세요.</p>
            )}
            {d.canSelfCheck && me && (
              <button className={me.attended ? 'done' : 'primary big'} disabled={busy || me.attended}
                onClick={() => act(() => api(`/days/${date}/attendance`, { method: 'POST' }), '출석 체크 완료! 맛있게 드세요.')}>
                {me.attended ? '출석 완료 ✓' : '🍚 먹었어요 (출석 체크)'}
              </button>
            )}
            {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}

            <h3>신청자 {d.roster.length}명</h3>
            <ul className="roster">
              {d.roster.map((r) => (
                <li key={r.id}>
                  <span>{r.name}{r.guests ? <small> +손님 {r.guests}{r.guestNote ? ` (${r.guestNote})` : ''}</small> : null}</span>
                  {canManageAttendance ? (
                    <label className="check">
                      <input type="checkbox" checked={r.attended} disabled={busy}
                        onChange={(e) => act(() => api(`/days/${date}/attendance/${r.id}`, { method: 'PUT', body: { attended: e.target.checked } }))} />
                      {r.attended ? '출석' : d.attendanceClosed ? '노쇼' : '미확인'}
                    </label>
                  ) : (d.phase === 'today' || d.phase === 'past') && (
                    <span className={r.attended ? 'ok small' : d.attendanceClosed ? 'err small' : 'muted small'}>
                      {r.attended ? '출석' : d.attendanceClosed ? '노쇼' : '미확인'}
                    </span>
                  )}
                  {user.isAdmin && (
                    <button className="link small" disabled={busy}
                      onClick={() => window.confirm(`${r.name}님 신청을 삭제할까요? (관리자 수정 기록이 남아요)`) &&
                        act(() => api(`/admin/days/${date}/signup/${r.id}`, { method: 'PUT', body: { remove: true } }))}>삭제</button>
                  )}
                </li>
              ))}
              {!d.roster.length && <li className="muted">아직 없어요.</li>}
            </ul>
            {user.isAdmin && <AdminAdd date={date} roster={d.roster} act={act} />}
          </>
        )}
        {user.isAdmin && d && <DayOverride date={date} d={d} act={act} />}
      </div>
    </div>
  );
}

function AdminAdd({ date, roster, act }) {
  const [users, setUsers] = useState([]);
  const [pick, setPick] = useState('');
  useEffect(() => { api('/admin/users').then((r) => setUsers(r.users.filter((u) => u.status === 'active' && u.isMember))); }, []);
  const avail = users.filter((u) => !roster.some((r) => r.id === u.id));
  if (!avail.length) return null;
  return (
    <details className="admin-box">
      <summary>관리자: 마감 후 신청자 추가</summary>
      <div className="row gap">
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">직원 선택</option>
          {avail.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button disabled={!pick} onClick={() => act(() => api(`/admin/days/${date}/signup/${pick}`, { method: 'PUT', body: { guests: 0 } }), '추가했어요.')}>추가</button>
      </div>
    </details>
  );
}

function DayOverride({ date, d, act }) {
  const [note, setNote] = useState(d.note || '');
  return (
    <details className="admin-box">
      <summary>관리자: 운영일/휴무일 설정</summary>
      <input placeholder="메모 (예: 창립기념일)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={30} />
      <div className="row gap">
        {d.mealDay
          ? <button onClick={() => act(() => api(`/admin/days/${date}`, { method: 'PUT', body: { closed: true, note } }), '휴무일로 바꿨어요.')}>휴무일로</button>
          : <button onClick={() => act(() => api(`/admin/days/${date}`, { method: 'PUT', body: { closed: false, note } }), '운영일로 바꿨어요.')}>운영일로</button>}
        <button className="link" onClick={() => act(() => api(`/admin/days/${date}`, { method: 'PUT', body: { reset: true } }), '기본값(평일 운영)으로 돌렸어요.')}>기본값</button>
      </div>
    </details>
  );
}
