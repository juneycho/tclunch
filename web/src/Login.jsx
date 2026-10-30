import React, { useState } from 'react';
import { api } from './api.js';

// 이름만 쓰고 들어가기. 처음 쓰는 이름이면 자동 등록. 관리자 이름일 때만 비밀번호를 묻는다.
export default function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const r = await api('/auth/enter', { method: 'POST', body: { name, password: needPw ? password : undefined } });
      if (r.needPassword) setNeedPw(true);
      else onLogin(r.user);
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
        <label>이름<input value={name} onChange={(e) => { setName(e.target.value); setNeedPw(false); }} required maxLength={10}
          placeholder="홍길동" autoComplete="username" autoFocus /></label>
        {needPw && (
          <label>관리자 비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required autoComplete="current-password" autoFocus /></label>
        )}
        <p className="small muted">{needPw ? '관리자 계정이라 비밀번호가 필요해요.' : '처음이면 이름만 쓰면 바로 등록돼요. 같은 이름이 있으면 \'김민수2\'처럼 구분해 주세요.'}</p>
        {msg && <p className="err">{msg}</p>}
        <button className="primary" disabled={busy}>{busy ? '들어가는 중…' : '들어가기'}</button>
      </form>
    </div>
  );
}
