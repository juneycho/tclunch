import React, { useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';
import { Brand, LangPicker } from './Brand.jsx';

// 이름만 쓰고 들어가기. 처음 쓰는 이름이면 자동 등록. 관리자 이름일 때만 비밀번호를 묻는다.
export default function Login({ onLogin }) {
  const t = useT();
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
      <div className="row login-lang"><LangPicker /></div>
      <Brand />
      <div className="deadline-note">⏰ {t('deadlineNotice')}</div>
      <form className="card form" onSubmit={submit}>
        <label>{t('name')}<input value={name} onChange={(e) => { setName(e.target.value); setNeedPw(false); }} required maxLength={10}
          placeholder={t('namePlaceholder')} autoComplete="username" autoFocus /></label>
        {needPw && (
          <label>{t('adminPassword')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required autoComplete="current-password" autoFocus /></label>
        )}
        <p className="small muted">{needPw ? t('adminPwHint') : t('loginHint')}</p>
        {msg && <p className="err">{msg}</p>}
        <button className="primary" disabled={busy}>{busy ? t('entering') : t('enter')}</button>
      </form>
    </div>
  );
}
