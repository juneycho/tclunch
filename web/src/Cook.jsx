import React, { useCallback, useEffect, useState } from 'react';
import { api, fmtDay, PHASE_LABEL, won } from './api.js';
import DayPanel from './DayPanel.jsx';

const sizeHint = (n) => (n <= 3 ? '소규모: 비빔밥·덮밥 같은 간단 메뉴' : n <= 8 ? '중간: 일반 한상 메뉴' : '대규모: 찌개·찜·고기 등 큰 메뉴로 나눠 먹기');

export default function Cook({ user, onChange }) {
  const [days, setDays] = useState([]);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api('/cook/upcoming').then((r) => setDays(r.days)), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="stack">
      <section>
        <h3>다가오는 식사일</h3>
        <p className="small muted">"인원 확정"된 날부터 메뉴를 올려 주세요. 신청자에게 바로 알림이 가요. 날짜를 누르면 명단과 출석 체크가 나와요.</p>
        <ul className="cook-list">
          {days.map((d) => <CookDay key={d.date} d={d} onSaved={() => { load(); onChange(); }} onOpen={() => setOpen(d.date)} />)}
        </ul>
      </section>
      <Expenses user={user} onChange={onChange} />
      {open && <DayPanel date={open} user={user} onClose={() => setOpen(null)} onChange={load} />}
    </div>
  );
}

function CookDay({ d, onSaved, onOpen }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(d.menu?.title || '');
  const [desc, setDesc] = useState(d.menu?.description || '');
  const [err, setErr] = useState(null);
  async function save() {
    try {
      await api(`/days/${d.date}/menu`, { method: 'PUT', body: { title, description: desc } });
      setEdit(false);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <li className={`card ${d.phase}`}>
      <div className="row between">
        <button className="link strong" onClick={onOpen}>{fmtDay(d.date)}</button>
        <span className={`badge ${d.phase}`}>{PHASE_LABEL[d.phase]}</span>
      </div>
      <div className="row between">
        <span className="big-num">{d.total}명 <small className="muted">(직원 {d.members} + 손님 {d.guests})</small></span>
      </div>
      {d.phase !== 'open' && <p className="small muted">{sizeHint(d.total)}</p>}
      {d.phase === 'open' && <p className="small muted">{fmtDay(d.deadline)} 마감 예정 · 아직 바뀔 수 있어요</p>}
      {edit ? (
        <div className="form">
          <input placeholder="메뉴 (예: 김치찌개, 계란말이)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          <textarea placeholder="설명 (선택)" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} rows={2} />
          {err && <p className="err">{err}</p>}
          <div className="row gap"><button className="primary" onClick={save}>저장</button><button className="link" onClick={() => setEdit(false)}>취소</button></div>
        </div>
      ) : (
        <div className="row between">
          <span>{d.menu ? <b>🍽 {d.menu.title}</b> : <span className="muted">메뉴 미정</span>}</span>
          <button onClick={() => setEdit(true)}>{d.menu ? '수정' : '메뉴 등록'}</button>
        </div>
      )}
    </li>
  );
}

function Expenses({ user, onChange }) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [list, setList] = useState([]);
  const [f, setF] = useState({ date: today, amount: '', memo: '' });
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
    if (!window.confirm(`${x.date} ${won(x.amount)} 지출을 지울까요?`)) return;
    await api(`/expenses/${x.id}`, { method: 'DELETE' }).catch((e) => setErr(e.message));
    load();
    onChange();
  }
  return (
    <section className="card">
      <h3>식비 지출 입력</h3>
      <form className="row gap wrap" onSubmit={add}>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        <input inputMode="numeric" placeholder="금액(원)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <input placeholder="메모 (예: 마트 장보기)" value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} maxLength={100} className="grow" />
        <button className="primary">추가</button>
      </form>
      {err && <p className="err">{err}</p>}
      <ul className="list">
        {list.map((x) => (
          <li key={x.id} className="row between">
            <span>{x.date} · {x.memo || '지출'} <small className="muted">{x.createdBy}</small></span>
            <span>{won(x.amount)} {(user.isAdmin || x.createdBy === user.name) && <button className="link small" onClick={() => del(x)}>삭제</button>}</span>
          </li>
        ))}
        {!list.length && <li className="muted">최근 60일 지출이 없어요.</li>}
      </ul>
    </section>
  );
}
