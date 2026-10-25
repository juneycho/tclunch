import React, { useCallback, useEffect, useState } from 'react';
import { api, won } from './api.js';

export default function Admin({ user, onChange }) {
  const [sec, setSec] = useState('users');
  return (
    <div className="stack">
      <nav className="subtabs">
        {[['users', '직원'], ['noshow', '노쇼'], ['budget', '예산'], ['settings', '설정'], ['audit', '기록']].map(([k, l]) => (
          <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{l}</button>
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
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(null);
  const [nu, setNu] = useState({ loginId: '', name: '', isCook: false });
  const load = useCallback(() => api('/admin/users').then((r) => setUsers(r.users)), []);
  useEffect(() => { load(); }, [load]);

  const patch = (u, body) => api(`/admin/users/${u.id}`, { method: 'PATCH', body }).then(load).catch((e) => setMsg({ ok: false, text: e.message }));
  async function reset(u) {
    if (!window.confirm(`${u.name}님 비밀번호를 초기화할까요?`)) return;
    const r = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' });
    setMsg({ ok: true, text: `${u.name}님 임시 비밀번호: ${r.tempPassword} (본인에게 직접 전달해 주세요. 첫 로그인 때 바꾸게 돼요.)` });
  }
  async function create(e) {
    e.preventDefault();
    try {
      const r = await api('/admin/users', { method: 'POST', body: nu });
      setMsg({ ok: true, text: `${nu.name}님 계정 생성! 아이디 ${nu.loginId} / 임시 비밀번호 ${r.tempPassword}` });
      setNu({ loginId: '', name: '', isCook: false });
      load();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }

  const pending = users.filter((u) => u.status === 'pending');
  const rest = users.filter((u) => u.status !== 'pending');
  return (
    <>
      {msg && <p className={msg.ok ? 'ok notice' : 'err'}>{msg.text}</p>}
      {pending.length > 0 && (
        <section className="card">
          <h3>가입 승인 대기 {pending.length}명</h3>
          <ul className="list">
            {pending.map((u) => (
              <li key={u.id} className="row between">
                <span>{u.name} <small className="muted">{u.loginId}</small></span>
                <span className="row gap">
                  <button className="primary" onClick={() => patch(u, { status: 'active' })}>승인</button>
                  <button className="link" onClick={() => patch(u, { status: 'inactive' })}>거절</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card">
        <h3>직원 {rest.filter((u) => u.status === 'active').length}명</h3>
        <p className="small muted">전출 가면 "비활성"으로 바꾸세요. 로그인이 막히고 마감 전 신청은 자동으로 지워져요. 기록은 남아요.</p>
        <div className="table">
          <div className="tr th"><span>이름</span><span>식사</span><span>요리사</span><span>관리자</span><span>상태</span><span /></div>
          {rest.map((u) => (
            <div key={u.id} className={`tr ${u.status}`}>
              <span>{u.name}<small className="muted"> {u.loginId}</small></span>
              <span><input type="checkbox" checked={u.isMember} onChange={(e) => patch(u, { isMember: e.target.checked })} aria-label="식사 신청 대상" /></span>
              <span><input type="checkbox" checked={u.isCook} onChange={(e) => patch(u, { isCook: e.target.checked })} aria-label="요리사" /></span>
              <span><input type="checkbox" checked={u.isAdmin} disabled={u.id === me.id} onChange={(e) => patch(u, { isAdmin: e.target.checked })} aria-label="관리자" /></span>
              <span>
                <select value={u.status} disabled={u.id === me.id} onChange={(e) => patch(u, { status: e.target.value })}>
                  <option value="active">재직</option><option value="inactive">비활성</option>
                </select>
              </span>
              <span><button className="link small" onClick={() => reset(u)}>비번<br />초기화</button></span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>직원 직접 추가</h3>
        <p className="small muted">보통은 초대 코드로 본인이 가입하면 돼요. 휴대폰이 익숙지 않은 분은 여기서 만들어 임시 비밀번호를 알려 주세요.</p>
        <form className="row gap wrap" onSubmit={create}>
          <input placeholder="이름" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} required />
          <input placeholder="아이디 (영문/숫자)" value={nu.loginId} onChange={(e) => setNu({ ...nu, loginId: e.target.value })} required autoCapitalize="none" />
          <label className="check"><input type="checkbox" checked={nu.isCook} onChange={(e) => setNu({ ...nu, isCook: e.target.checked })} />요리사</label>
          <button className="primary">추가</button>
        </form>
      </section>
    </>
  );
}

function NoShows() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/admin/noshows').then((r) => setRows(r.rows)); }, []);
  return (
    <section className="card">
      <h3>노쇼 현황</h3>
      <p className="small muted">신청하고 출석 체크가 안 된 끼니예요. 착오가 있으면 달력에서 그날을 눌러 출석으로 바꿔 주세요.</p>
      <div className="table">
        <div className="tr th"><span>이름</span><span>신청</span><span>노쇼</span><span>90일</span></div>
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
  const [list, setList] = useState([]);
  const ym = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
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
      <h3>식비 예산</h3>
      <p className="small muted">기간별 총예산을 넣으면 맨 위에 총예산/사용/남은 예산이 보여요. 지출은 요리사 탭에서 입력해요.</p>
      <form className="row gap wrap" onSubmit={save}>
        <input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required />
        <span>~</span>
        <input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} required />
        <input inputMode="numeric" placeholder="예산(원)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <input placeholder="메모" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="primary">{f.id ? '수정' : '추가'}</button>
      </form>
      {err && <p className="err">{err}</p>}
      <ul className="list">
        {list.map((b) => (
          <li key={b.id} className="row between">
            <span>{b.startDate} ~ {b.endDate} {b.note && <small className="muted">{b.note}</small>}</span>
            <span>{won(b.amount)}{' '}
              <button className="link small" onClick={() => setF({ ...b, amount: String(b.amount), note: b.note || '' })}>수정</button>
              <button className="link small" onClick={() => window.confirm('이 예산을 지울까요?') && api(`/admin/budgets/${b.id}`, { method: 'DELETE' }).then(load).then(onChange)}>삭제</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api('/admin/settings').then(setS); }, []);
  if (!s) return null;
  const fields = [
    ['deadline_days', '신청 마감 (식사일 며칠 전)', '일 전'],
    ['attendance_close_hour', '출석 체크 마감 시각 (이후 미체크는 노쇼)', '시'],
    ['noshow_threshold', '관리자에게 알릴 노쇼 횟수 (최근 90일)', '회'],
    ['reminder_hour', '마감 전날 리마인드 시각', '시'],
    ['max_guests', '1인당 최대 손님 수', '명'],
  ];
  async function save(e) {
    e.preventDefault();
    try {
      const body = Object.fromEntries(fields.map(([k]) => [k, Number(s[k])]));
      body.invite_code = s.invite_code;
      setS(await api('/admin/settings', { method: 'PUT', body }));
      setMsg({ ok: true, text: '저장했어요.' });
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }
  return (
    <form className="card form" onSubmit={save}>
      <h3>설정</h3>
      {fields.map(([k, label, unit]) => (
        <label key={k}>{label}
          <span className="row gap"><input type="number" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} className="short" />{unit}</span>
        </label>
      ))}
      <label>가입 초대 코드 (직원들에게만 알려 주세요. 비우면 가입 막힘)
        <input value={s.invite_code} onChange={(e) => setS({ ...s, invite_code: e.target.value })} placeholder="6자 이상" />
      </label>
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      <button className="primary">저장</button>
    </form>
  );
}

function Audit() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/admin/audit').then((r) => setRows(r.rows)); }, []);
  return (
    <section className="card">
      <h3>변경 기록</h3>
      <ul className="list small">
        {rows.map((r) => <li key={r.id}><b>{r.actor}</b> {r.action} <span className="muted">{r.createdAt}</span><br /><code>{r.detail}</code></li>)}
        {!rows.length && <li className="muted">기록이 없어요.</li>}
      </ul>
    </section>
  );
}
