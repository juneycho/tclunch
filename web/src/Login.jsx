import React, { useState } from 'react';
import { api } from './api.js';

// 이름 + 비밀번호 하나로: 처음이면 그 비밀번호로 새로 만들어지고, 다음부터는 같은 비밀번호로 들어온다.
export default function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const r = await api('/auth/enter', { method: 'POST', body: { name, password } });
      onLogin(r.user);
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="page narrow pad">
      <div className="hero">
        <img src="/icon.svg" alt="" width="64" height="64" />
        <h1>TC 점심</h1>
        <p className="muted">점심 신청은 식사일 1주일 전에 마감돼요.</p>
      </div>
      <form className="card form" onSubmit={submit}>
        <label>이름<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={10}
          placeholder="홍길동" autoComplete="username" /></label>
        <label>비밀번호 (숫자 4자리 이상)<input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          required minLength={4} inputMode="numeric" autoComplete="current-password" /></label>
        <p className="small muted">처음이면 지금 쓴 비밀번호로 바로 등록돼요. 다른 사람이 내 이름으로 신청하지 못하게 하는 용도예요.</p>
        {msg && <p className="err">{msg}</p>}
        <button className="primary" disabled={busy}>{busy ? '들어가는 중…' : '들어가기'}</button>
      </form>
    </div>
  );
}
