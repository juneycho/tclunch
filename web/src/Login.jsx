import React, { useState } from 'react';
import { api } from './api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ loginId: '', password: '', name: '', inviteCode: '', password2: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const r = await api('/auth/login', { method: 'POST', body: { loginId: f.loginId, password: f.password } });
        onLogin(r.user);
      } else {
        if (f.password !== f.password2) throw new Error('비밀번호 확인이 달라요.');
        const r = await api('/auth/register', { method: 'POST', body: f });
        setMsg({ ok: true, text: r.message });
        setMode('login');
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally { setBusy(false); }
  }

  return (
    <div className="page narrow">
      <div className="hero">
        <img src="/icon.svg" alt="" width="64" height="64" />
        <h1>TC 점심</h1>
        <p className="muted">점심 신청은 식사일 1주일 전에 마감돼요.</p>
      </div>
      <form className="card form" onSubmit={submit}>
        {mode === 'register' && (
          <>
            <label>초대 코드<input value={f.inviteCode} onChange={set('inviteCode')} required autoComplete="off" /></label>
            <label>이름<input value={f.name} onChange={set('name')} required maxLength={30} placeholder="홍길동" /></label>
          </>
        )}
        <label>아이디<input value={f.loginId} onChange={set('loginId')} required autoCapitalize="none" autoComplete="username" /></label>
        <label>비밀번호<input type="password" value={f.password} onChange={set('password')} required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 8} /></label>
        {mode === 'register' && (
          <label>비밀번호 확인<input type="password" value={f.password2} onChange={set('password2')} required autoComplete="new-password" /></label>
        )}
        {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
        <button className="primary" disabled={busy}>{mode === 'login' ? '로그인' : '가입 신청'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMsg(null); }}>
          {mode === 'login' ? '처음이세요? 가입하기' : '이미 계정이 있어요'}
        </button>
      </form>
    </div>
  );
}
