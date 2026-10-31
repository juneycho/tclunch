import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';
import { Brand, LangPicker } from './Brand.jsx';
import { isStandalone } from './push.js';

// 이름만 쓰고 들어가기. 처음 쓰는 이름이면 자동 등록. 관리자 이름일 때만 비밀번호를 묻는다.
export default function Login({ onLogin }) {
  const t = useT();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { api('/notice').then((r) => setNotice(r.text || '')).catch(() => {}); }, []);

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
      <div className="deadline-note">{t('deadlineNotice')}</div>
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
      <div className="fineprint">
        {notice && <p className="pre notice-line">{notice}</p>}
        {!isStandalone() && <InstallGuide />}
      </div>
    </div>
  );
}

// 첫 화면 앱 설치 안내. 안드로이드 크롬이 설치를 허락하면 버튼 한 번으로 설치된다.
function InstallGuide() {
  const t = useT();
  const [canInstall, setCanInstall] = useState(() => !!window.tcInstallPrompt);
  useEffect(() => {
    const on = () => setCanInstall(true);
    window.addEventListener('tc-installable', on);
    return () => window.removeEventListener('tc-installable', on);
  }, []);
  async function install() {
    const p = window.tcInstallPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice.catch(() => {});
    window.tcInstallPrompt = null;
    setCanInstall(false);
  }
  // 카카오톡 안 브라우저에서는 설치·알림이 안 되므로 바깥 브라우저로 여는 버튼을 크게 보여 준다
  const inKakao = /KAKAOTALK/i.test(navigator.userAgent);
  return (
    <div className={`install${inKakao ? ' kakao' : ''}`}>
      <b>{t('installTitle')}</b>
      {inKakao && <a className="accent-btn" href={`kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`}>{t('openExternal')}</a>}
      {canInstall && <button className="accent" onClick={install}>{t('installBtn')}</button>}
      <p className="pre">{t('installSteps')}</p>
    </div>
  );
}
